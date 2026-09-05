import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,ImageBackground,Platform,SafeAreaView,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {router,useFocusEffect} from 'expo-router';
import {RepairPilotLidarPreview} from '../modules/repairpilot-lidar';
import {fuseHardwareDepth,HardwareScanResult,scanHardwarePhoto} from '../src/hardwareScanner';
import {autoCaptureHardwareWithLidar,lidarAvailability,measurementsForIdentifiedPart} from '../src/lidarScanner';

const API=process.env.EXPO_PUBLIC_API_URL||'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';
const PENDING_SCAN_KEY='repairpilot.hardware.pendingScan';
const PENDING_DEPTH_KEY='repairpilot.hardware.pendingDepth';
const HISTORY_KEY='repairpilot.hardware.scanHistory';
const heavy=Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed'});
const condensed=Platform.select({ios:'AvenirNextCondensed-DemiBold',android:'sans-serif-condensed'});

type ScanHistoryItem={id:string;createdAt:string;imageUri?:string;result:HardwareScanResult};

const isMetric=(r:HardwareScanResult|null)=>{
 if(!r)return false;
 const text=`${r.identified_part||''} ${r.standard||''} ${(r.markings||[]).join(' ')}`;
 return /\bmetric\b|\bM\d+(?:[xX×]\d+(?:\.\d+)?)?\b|\bISO\s*\d+\b|\bDIN\s*\d+\b|\bJIS\b/i.test(text);
};
const formatDim=(value:number|null|undefined,metric:boolean)=>value==null?'—':metric?`${Math.round(value*100)/100} mm`:`${(value/25.4).toFixed(3)} in`;

export default function HardwareScannerRoute(){
 const [image,setImage]=useState<any>(null);
 const [result,setResult]=useState<HardwareScanResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [lidarAvailable,setLidarAvailable]=useState(false);
 const [lidarReason,setLidarReason]=useState('Checking LiDAR support…');
 const [cameraPermission,setCameraPermission]=useState(false);
 const [status,setStatus]=useState('CENTER PART • CHECK FOCUS • TAP START SCAN');
 const [recent,setRecent]=useState<ScanHistoryItem[]>([]);

 const loadRecent=async()=>{try{const raw=await AsyncStorage.getItem(HISTORY_KEY);setRecent(raw?JSON.parse(raw).slice(0,3):[])}catch{setRecent([])}};
 useEffect(()=>{
   ImagePicker.requestCameraPermissionsAsync().then(p=>setCameraPermission(p.granted)).catch(()=>setCameraPermission(false));
   lidarAvailability().then(a=>{setLidarAvailable(a.available);setLidarReason(a.reason||'Camera + LiDAR depth are ready.');if(!a.available)setStatus('LiDAR UNAVAILABLE • USE TAKE PHOTO OR LIBRARY')});
   loadRecent();
 },[]);
 useFocusEffect(useCallback(()=>{restoreAndFuseDepth();loadRecent()},[]));

 const persistHistory=async(r:HardwareScanResult,sourceUri?:string)=>{
   try{
     let storedUri=sourceUri;
     if(sourceUri&&FileSystem.documentDirectory){
       const dir=`${FileSystem.documentDirectory}hardware-scans/`;
       await FileSystem.makeDirectoryAsync(dir,{intermediates:true}).catch(()=>{});
       const target=`${dir}${Date.now()}.jpg`;
       await FileSystem.copyAsync({from:sourceUri,to:target}).then(()=>{storedUri=target}).catch(()=>{});
     }
     const raw=await AsyncStorage.getItem(HISTORY_KEY);
     const old:ScanHistoryItem[]=raw?JSON.parse(raw):[];
     const entry:ScanHistoryItem={id:`scan-${Date.now()}`,createdAt:new Date().toISOString(),imageUri:storedUri,result:r};
     const next=[entry,...old].slice(0,40);
     await AsyncStorage.setItem(HISTORY_KEY,JSON.stringify(next));
     setRecent(next.slice(0,3));
   }catch{}
 };

 const restoreAndFuseDepth=async()=>{
   try{
     const [scanRaw,depthRaw,token]=await Promise.all([AsyncStorage.getItem(PENDING_SCAN_KEY),AsyncStorage.getItem(PENDING_DEPTH_KEY),SecureStore.getItemAsync(TOKEN_KEY)]);
     if(scanRaw)setResult(JSON.parse(scanRaw) as HardwareScanResult);
     if(!scanRaw||!depthRaw||!token)return;
     const saved=JSON.parse(scanRaw) as HardwareScanResult,depth=JSON.parse(depthRaw);
     setBusy(true);
     const fused=await fuseHardwareDepth({apiBase:API,token,scan:saved,measurements:depth.measurements||{},confidence:Number(depth.confidence)||0,source:depth.source||'arkit_lidar'});
     setResult(fused);await AsyncStorage.setItem(PENDING_SCAN_KEY,JSON.stringify(fused));await AsyncStorage.removeItem(PENDING_DEPTH_KEY);
   }catch(e:any){Alert.alert('LiDAR Fusion',e?.message||'Could not apply the LiDAR measurement to this scan.')}finally{setBusy(false)}
 };

 const finishScan=async(r:HardwareScanResult,asset:any)=>{
   setResult(r);setStatus('SCAN COMPLETE');
   await AsyncStorage.setItem(PENDING_SCAN_KEY,JSON.stringify(r));
   await AsyncStorage.removeItem(PENDING_DEPTH_KEY);
   await persistHistory(r,asset?.uri);
 };

 const analyze=async(asset:any)=>{
   const token=await SecureStore.getItemAsync(TOKEN_KEY);if(!token)throw new Error('Please sign in to use Hardware Scanner.');
   setBusy(true);setStatus('IDENTIFYING PART…');setResult(null);
   try{const scan=await scanHardwarePhoto({apiBase:API,token,uri:asset.uri,kind:'AUTO',fileName:asset.fileName||'repairpilot-hardware.jpg',mimeType:asset.mimeType||'image/jpeg'});await finishScan(scan,asset);return scan}finally{setBusy(false)}
 };

 const runAutoScan=async()=>{
   if(busy)return;
   try{
     const token=await SecureStore.getItemAsync(TOKEN_KEY);if(!token)throw new Error('Please sign in to use Hardware Scanner.');
     let permission=cameraPermission;if(!permission){const p=await ImagePicker.requestCameraPermissionsAsync();permission=p.granted;setCameraPermission(permission)}
     if(!permission)throw new Error('Camera permission is required for automatic Hardware Scanner.');if(!lidarAvailable)throw new Error(lidarReason);
     setBusy(true);setResult(null);setImage(null);setStatus('CAMERA + LiDAR SCANNING…');
     const capture=await autoCaptureHardwareWithLidar();
     const path=`${FileSystem.cacheDirectory}repairpilot-auto-${Date.now()}.jpg`;
     await FileSystem.writeAsStringAsync(path,capture.imageBase64,{encoding:FileSystem.EncodingType.Base64});
     const asset={uri:path,fileName:'repairpilot-auto.jpg',mimeType:capture.mimeType};setImage(asset);setStatus('IDENTIFYING PART…');
     const scan=await scanHardwarePhoto({apiBase:API,token,uri:path,kind:'AUTO',fileName:'repairpilot-auto.jpg',mimeType:capture.mimeType});
     const semantic=measurementsForIdentifiedPart(capture,scan);let final=scan;
     try{final=await fuseHardwareDepth({apiBase:API,token,scan,measurements:semantic,confidence:capture.confidence,source:'arkit_lidar_auto_3d'})}catch(e:any){final={...scan,warnings:[...(scan.warnings||[]),`LiDAR measurement fusion failed: ${e?.message||'unknown error'}`]}}
     await finishScan(final,asset);
   }catch(e:any){setStatus('SCAN NEEDS RETRY');Alert.alert('Automatic Hardware Scan',e?.message||'Automatic camera + LiDAR scan failed.')}finally{setBusy(false)}
 };

 const capture=async()=>{try{const p=await ImagePicker.requestCameraPermissionsAsync();if(!p.granted)return Alert.alert('RepairPilot','Camera permission is required for Hardware Scanner.');const picked=await ImagePicker.launchCameraAsync({quality:.92,mediaTypes:['images']});if(picked.canceled)return;const asset=picked.assets[0];setImage(asset);await analyze(asset)}catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}};
 const choose=async()=>{try{const picked=await ImagePicker.launchImageLibraryAsync({quality:.92,mediaTypes:['images'],allowsMultipleSelection:false});if(picked.canceled)return;const asset=picked.assets[0];setImage(asset);await analyze(asset)}catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}};
 const startOver=async()=>{setImage(null);setResult(null);setStatus(lidarAvailable?'CENTER PART • CHECK FOCUS • TAP START SCAN':'LiDAR UNAVAILABLE • USE TAKE PHOTO OR LIBRARY');await AsyncStorage.multiRemove([PENDING_SCAN_KEY,PENDING_DEPTH_KEY])};
 const openReplacement=()=>{if(result)router.push('/replacement-match' as any)};
 const showLivePreview=!busy&&!image&&!result&&cameraPermission;
 const metric=isMetric(result);
 const dims=result?.measurements||{};

 const ResultOverlay=()=>!result?null:<View style={s.resultOverlay}>
   <View style={s.resultTop}><View style={{flex:1}}><Text style={s.kicker}>SCAN RESULT • {result.kind}</Text><Text style={s.part}>{result.identified_part||'Not identified with enough confidence'}</Text></View><TouchableOpacity style={s.close} onPress={startOver}><MaterialCommunityIcons name="close" size={21} color="#eee9df"/></TouchableOpacity></View>
   <View style={s.matchRow}><Text style={s.matchText}>{Math.round((result.confidence||0)*100)}% MATCH</Text><Text style={s.units}>{metric?'METRIC • mm':'IMPERIAL • in'}</Text></View>
   {result.standard?<Text style={s.standard}>{result.standard}</Text>:null}
   <View style={s.quickDims}>{dims.length_mm!=null?<View style={s.quickDim}><Text style={s.quickLabel}>LENGTH</Text><Text style={s.quickValue}>{formatDim(dims.length_mm,metric)}</Text></View>:null}{dims.diameter_mm!=null?<View style={s.quickDim}><Text style={s.quickLabel}>DIAMETER</Text><Text style={s.quickValue}>{formatDim(dims.diameter_mm,metric)}</Text></View>:null}{dims.width_mm!=null?<View style={s.quickDim}><Text style={s.quickLabel}>WIDTH</Text><Text style={s.quickValue}>{formatDim(dims.width_mm,metric)}</Text></View>:null}{dims.height_mm!=null?<View style={s.quickDim}><Text style={s.quickLabel}>HEIGHT</Text><Text style={s.quickValue}>{formatDim(dims.height_mm,metric)}</Text></View>:null}</View>
   {result.warnings?.[0]?<Text style={s.warning} numberOfLines={2}>{result.warnings[0]}</Text>:null}
   <View style={s.overlayActions}><TouchableOpacity style={s.secondaryAction} onPress={startOver}><Text style={s.secondaryText}>NEW SCAN</Text></TouchableOpacity><TouchableOpacity style={s.primaryAction} onPress={openReplacement}><Text style={s.primaryText}>FIND REPLACEMENT</Text></TouchableOpacity></View>
 </View>;

 return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={s.bg} imageStyle={{opacity:.94}}><View style={s.shade}/>
   <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.hit}><MaterialCommunityIcons name="chevron-left" size={28} color="#eee9df"/></TouchableOpacity><Text style={s.title}>HARDWARE SCANNER</Text><TouchableOpacity style={s.hit} onPress={()=>Alert.alert('Hardware Scanner','Use the live camera view to center the entire part and confirm focus and angle. Tap START SCAN only when the view looks good. Results appear directly over the captured camera view, and each completed scan is saved to Recent Scans.')}><MaterialCommunityIcons name="information-outline" size={20} color="#eee9df"/></TouchableOpacity></View>
   <ScrollView contentContainerStyle={s.wrap}>
     <View style={s.banner}><MaterialCommunityIcons name="cube-scan" size={22} color="#ffad00"/><View style={{flex:1}}><Text style={s.bannerTitle}>CAMERA + LiDAR AUTO MEASURE</Text><Text style={s.bannerSub}>{lidarAvailable?'Center the part, check focus, then tap START SCAN.':lidarReason}</Text></View><View style={[s.dot,lidarAvailable&&s.dotOn]}/></View>
     <View style={s.frame}>
       {showLivePreview?<RepairPilotLidarPreview style={StyleSheet.absoluteFill}/>:null}
       {image?<Image source={{uri:image.uri}} style={s.photo}/>:null}
       {!showLivePreview&&!image&&!busy&&!result?<View style={s.empty}><MaterialCommunityIcons name="camera-off-outline" size={50} color="#ffad00"/><Text style={s.emptyTitle}>CAMERA PREVIEW UNAVAILABLE</Text></View>:null}
       {showLivePreview?<View pointerEvents="none" style={s.liveOverlay}><Text style={s.ready}>{status}</Text><View style={s.target}/><Text style={s.liveHint}>Keep the entire part inside the frame</Text></View>:null}
       {busy?<View style={s.busy}><ActivityIndicator size="large" color="#ffad00"/><Text style={s.busyText}>{status}</Text></View>:null}
       <ResultOverlay/>
     </View>
     <TouchableOpacity style={[s.startButton,(!lidarAvailable||busy||!cameraPermission)&&s.disabled]} disabled={!lidarAvailable||busy||!cameraPermission} onPress={runAutoScan}><MaterialCommunityIcons name="scan-helper" size={23} color="#111"/><Text style={s.startText}>{result?'SCAN AGAIN':'START SCAN'}</Text></TouchableOpacity>
     <View style={s.manualRow}><TouchableOpacity style={s.manual} disabled={busy} onPress={capture}><MaterialCommunityIcons name="camera-outline" size={21} color="#eee9df"/><Text style={s.manualText}>TAKE PHOTO</Text></TouchableOpacity><TouchableOpacity style={s.manual} disabled={busy} onPress={choose}><MaterialCommunityIcons name="image-multiple-outline" size={21} color="#eee9df"/><Text style={s.manualText}>LIBRARY</Text></TouchableOpacity></View>

     <View style={s.recentHead}><Text style={s.recentTitle}>RECENT SCANS</Text><TouchableOpacity onPress={()=>router.push('/hardware-scan-history' as any)}><Text style={s.viewAll}>OPEN SCAN HISTORY</Text></TouchableOpacity></View>
     {recent.length?recent.map(item=>{const m=isMetric(item.result);const d=item.result.measurements||{};return <TouchableOpacity key={item.id} style={s.recentCard} onPress={()=>router.push('/hardware-scan-history' as any)}>{item.imageUri?<Image source={{uri:item.imageUri}} style={s.thumb}/>:<View style={s.thumbEmpty}><MaterialCommunityIcons name="cube-scan" size={24} color="#ffad00"/></View>}<View style={{flex:1}}><Text style={s.recentPart} numberOfLines={1}>{item.result.identified_part||'Unidentified hardware'}</Text><Text style={s.recentMeta}>{new Date(item.createdAt).toLocaleString()} • {Math.round((item.result.confidence||0)*100)}%</Text><Text style={s.recentDims} numberOfLines={1}>{d.length_mm!=null?`L ${formatDim(d.length_mm,m)}  `:''}{d.diameter_mm!=null?`Ø ${formatDim(d.diameter_mm,m)}`:''}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#8d887e"/></TouchableOpacity>}):<View style={s.noRecent}><MaterialCommunityIcons name="history" size={26} color="#777168"/><Text style={s.noRecentText}>Completed scans will appear here.</Text></View>}
     <TouchableOpacity style={s.historyButton} onPress={()=>router.push('/hardware-scan-history' as any)}><MaterialCommunityIcons name="history" size={19} color="#ffad00"/><Text style={s.historyText}>OPEN FULL SCAN HISTORY</Text></TouchableOpacity>
   </ScrollView>
 </ImageBackground></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#050607'},bg:{flex:1},shade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.18)'},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,backgroundColor:'rgba(4,5,6,.9)',borderBottomWidth:1.5,borderBottomColor:'#a86b00'},hit:{width:42,height:42,alignItems:'center',justifyContent:'center'},title:{color:'#eee9df',fontFamily:heavy,fontWeight:'900',fontSize:20},wrap:{paddingHorizontal:14,paddingTop:10,paddingBottom:34},
 banner:{minHeight:62,borderWidth:1,borderColor:'#725713',backgroundColor:'rgba(10,11,11,.9)',padding:10,flexDirection:'row',alignItems:'center',gap:9,marginBottom:9},bannerTitle:{color:'#ffad00',fontFamily:heavy,fontWeight:'900',fontSize:12},bannerSub:{color:'#b8b2a8',fontFamily:condensed,fontSize:10,marginTop:2},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#633'},dotOn:{backgroundColor:'#62c957'},
 frame:{height:390,overflow:'hidden',borderWidth:1.7,borderColor:'#ffad00',backgroundColor:'#050607'},photo:{...StyleSheet.absoluteFill,width:'100%',height:'100%',resizeMode:'cover'},empty:{flex:1,alignItems:'center',justifyContent:'center'},emptyTitle:{color:'#ddd8cf',fontFamily:heavy,fontSize:13,marginTop:8},liveOverlay:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center'},ready:{position:'absolute',top:13,color:'#8fdf77',fontFamily:heavy,fontSize:9,borderWidth:1,borderColor:'#4a8b3b',backgroundColor:'rgba(0,0,0,.55)',paddingHorizontal:8,paddingVertical:3},target:{width:'72%',height:'63%',borderWidth:1.5,borderColor:'rgba(255,173,0,.82)'},liveHint:{position:'absolute',bottom:14,color:'#eee9df',fontFamily:condensed,fontSize:10,backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:8,paddingVertical:4},busy:{...StyleSheet.absoluteFill,backgroundColor:'rgba(3,4,5,.78)',alignItems:'center',justifyContent:'center',zIndex:5},busyText:{color:'#eee9df',fontFamily:heavy,fontSize:11,marginTop:8},
 resultOverlay:{position:'absolute',left:10,right:10,bottom:10,maxHeight:300,borderWidth:1.5,borderColor:'#d58b00',backgroundColor:'rgba(7,8,8,.94)',padding:11,zIndex:8},resultTop:{flexDirection:'row',alignItems:'flex-start',gap:8},kicker:{color:'#ffad00',fontFamily:heavy,fontSize:9},part:{color:'#f1ece3',fontFamily:heavy,fontSize:20,marginTop:2},close:{width:34,height:34,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#615b52'},matchRow:{flexDirection:'row',justifyContent:'space-between',marginTop:6},matchText:{color:'#95e384',fontFamily:heavy,fontSize:9},units:{color:'#d6b25f',fontFamily:heavy,fontSize:8},standard:{color:'#c8c2b8',fontFamily:condensed,fontSize:10,marginTop:4},quickDims:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},quickDim:{minWidth:'47%',flexGrow:1,borderWidth:1,borderColor:'#5a5246',backgroundColor:'rgba(0,0,0,.35)',padding:7},quickLabel:{color:'#969087',fontFamily:heavy,fontSize:7},quickValue:{color:'#eee9df',fontFamily:heavy,fontSize:13,marginTop:2},warning:{color:'#d9b66f',fontFamily:condensed,fontSize:9,marginTop:7},overlayActions:{flexDirection:'row',gap:7,marginTop:8},secondaryAction:{flex:1,height:38,borderWidth:1,borderColor:'#746b5b',alignItems:'center',justifyContent:'center'},secondaryText:{color:'#ddd8cf',fontFamily:heavy,fontSize:8},primaryAction:{flex:1.4,height:38,backgroundColor:'#ffad00',alignItems:'center',justifyContent:'center'},primaryText:{color:'#111',fontFamily:heavy,fontSize:9},
 startButton:{height:52,marginTop:9,backgroundColor:'#ffad00',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},startText:{color:'#111',fontFamily:heavy,fontSize:13},disabled:{opacity:.45},manualRow:{height:62,flexDirection:'row',gap:9,marginTop:8},manual:{flex:1,borderWidth:1,borderColor:'#685e4c',backgroundColor:'rgba(11,12,12,.9)',alignItems:'center',justifyContent:'center'},manualText:{color:'#d8d3ca',fontFamily:heavy,fontSize:9,marginTop:2},
 recentHead:{marginTop:16,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},recentTitle:{color:'#eee9df',fontFamily:heavy,fontSize:14},viewAll:{color:'#ffad00',fontFamily:heavy,fontSize:8},recentCard:{minHeight:74,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#61594d',backgroundColor:'rgba(10,11,11,.88)',padding:8,marginBottom:7},thumb:{width:58,height:58,backgroundColor:'#111',resizeMode:'cover'},thumbEmpty:{width:58,height:58,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},recentPart:{color:'#eee9df',fontFamily:heavy,fontSize:12},recentMeta:{color:'#8f8a82',fontFamily:condensed,fontSize:8.5,marginTop:2},recentDims:{color:'#c9b47a',fontFamily:condensed,fontSize:9,marginTop:3},noRecent:{height:82,borderWidth:1,borderColor:'#5e574d',backgroundColor:'rgba(10,11,11,.8)',alignItems:'center',justifyContent:'center'},noRecentText:{color:'#8f8a82',fontFamily:condensed,fontSize:10,marginTop:4},historyButton:{height:46,marginTop:8,borderWidth:1,borderColor:'#8a6816',backgroundColor:'rgba(16,15,12,.9)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},historyText:{color:'#e6dfd3',fontFamily:heavy,fontSize:9}
});
