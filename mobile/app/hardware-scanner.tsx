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
const heavy=Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed'});
const condensed=Platform.select({ios:'AvenirNextCondensed-DemiBold',android:'sans-serif-condensed'});

export default function HardwareScannerRoute(){
 const [image,setImage]=useState<any>(null);
 const [result,setResult]=useState<HardwareScanResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [lidarAvailable,setLidarAvailable]=useState(false);
 const [lidarReason,setLidarReason]=useState('Checking LiDAR support…');
 const [cameraPermission,setCameraPermission]=useState(false);
 const [status,setStatus]=useState('CENTER PART • CHECK FOCUS • TAP START SCAN');

 useEffect(()=>{
   ImagePicker.requestCameraPermissionsAsync().then(p=>setCameraPermission(p.granted)).catch(()=>setCameraPermission(false));
   lidarAvailability().then(a=>{
     setLidarAvailable(a.available);
     setLidarReason(a.reason||'Camera + LiDAR depth are ready.');
     if(!a.available)setStatus('LiDAR UNAVAILABLE • USE TAKE PHOTO OR LIBRARY');
   });
 },[]);
 useFocusEffect(useCallback(()=>{restoreAndFuseDepth()},[]));

 const restoreAndFuseDepth=async()=>{
   try{
     const [scanRaw,depthRaw,token]=await Promise.all([
       AsyncStorage.getItem(PENDING_SCAN_KEY),AsyncStorage.getItem(PENDING_DEPTH_KEY),SecureStore.getItemAsync(TOKEN_KEY)
     ]);
     if(scanRaw)setResult(JSON.parse(scanRaw) as HardwareScanResult);
     if(!scanRaw||!depthRaw||!token)return;
     const saved=JSON.parse(scanRaw) as HardwareScanResult;
     const depth=JSON.parse(depthRaw);
     setBusy(true);
     const fused=await fuseHardwareDepth({apiBase:API,token,scan:saved,measurements:depth.measurements||{},confidence:Number(depth.confidence)||0,source:depth.source||'arkit_lidar'});
     setResult(fused);
     await AsyncStorage.setItem(PENDING_SCAN_KEY,JSON.stringify(fused));
     await AsyncStorage.removeItem(PENDING_DEPTH_KEY);
   }catch(e:any){Alert.alert('LiDAR Fusion',e?.message||'Could not apply the LiDAR measurement to this scan.')}finally{setBusy(false)}
 };

 const analyze=async(asset:any)=>{
   const token=await SecureStore.getItemAsync(TOKEN_KEY);
   if(!token)throw new Error('Please sign in to use Hardware Scanner.');
   setBusy(true);setStatus('IDENTIFYING PART…');setResult(null);
   try{
     const scan=await scanHardwarePhoto({apiBase:API,token,uri:asset.uri,kind:'AUTO',fileName:asset.fileName||'repairpilot-hardware.jpg',mimeType:asset.mimeType||'image/jpeg'});
     setResult(scan);setStatus('SCAN COMPLETE');
     await AsyncStorage.setItem(PENDING_SCAN_KEY,JSON.stringify(scan));
     await AsyncStorage.removeItem(PENDING_DEPTH_KEY);
     return scan;
   }finally{setBusy(false)}
 };

 const runAutoScan=async()=>{
   if(busy)return;
   try{
     const token=await SecureStore.getItemAsync(TOKEN_KEY);
     if(!token)throw new Error('Please sign in to use Hardware Scanner.');
     let permission=cameraPermission;
     if(!permission){const p=await ImagePicker.requestCameraPermissionsAsync();permission=p.granted;setCameraPermission(permission)}
     if(!permission)throw new Error('Camera permission is required for automatic Hardware Scanner.');
     if(!lidarAvailable)throw new Error(lidarReason);

     setBusy(true);setResult(null);setImage(null);setStatus('CAMERA + LiDAR SCANNING…');
     await new Promise(resolve=>setTimeout(resolve,220));
     const capture=await autoCaptureHardwareWithLidar();
     const path=`${FileSystem.cacheDirectory}repairpilot-auto-${Date.now()}.jpg`;
     await FileSystem.writeAsStringAsync(path,capture.imageBase64,{encoding:FileSystem.EncodingType.Base64});
     const asset={uri:path,fileName:'repairpilot-auto.jpg',mimeType:capture.mimeType};
     setImage(asset);setStatus('IDENTIFYING PART…');

     const scan=await scanHardwarePhoto({apiBase:API,token,uri:path,kind:'AUTO',fileName:'repairpilot-auto.jpg',mimeType:capture.mimeType});
     const semanticMeasurements=measurementsForIdentifiedPart(capture,scan);
     let final=scan;
     try{
       final=await fuseHardwareDepth({apiBase:API,token,scan,measurements:semanticMeasurements,confidence:capture.confidence,source:'arkit_lidar_auto_3d'});
     }catch(e:any){
       final={...scan,warnings:[...(scan.warnings||[]),`LiDAR measurement fusion failed: ${e?.message||'unknown error'}`]};
     }
     setResult(final);setStatus('SCAN COMPLETE');
     await AsyncStorage.setItem(PENDING_SCAN_KEY,JSON.stringify(final));
     await AsyncStorage.removeItem(PENDING_DEPTH_KEY);
   }catch(e:any){
     setStatus('SCAN NEEDS RETRY');
     Alert.alert('Automatic Hardware Scan',e?.message||'Automatic camera + LiDAR scan failed.');
   }finally{setBusy(false)}
 };

 const capture=async()=>{
   try{
     const permission=await ImagePicker.requestCameraPermissionsAsync();
     if(!permission.granted)return Alert.alert('RepairPilot','Camera permission is required for Hardware Scanner.');
     const picked=await ImagePicker.launchCameraAsync({quality:.92,mediaTypes:['images']});
     if(picked.canceled)return;
     const asset=picked.assets[0];setImage(asset);await analyze(asset);
   }catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}
 };
 const choose=async()=>{
   try{
     const picked=await ImagePicker.launchImageLibraryAsync({quality:.92,mediaTypes:['images'],allowsMultipleSelection:false});
     if(picked.canceled)return;
     const asset=picked.assets[0];setImage(asset);await analyze(asset);
   }catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}
 };
 const openLidar=()=>{if(!result)return Alert.alert('Hardware Scanner','Identify the part first.');if(!lidarAvailable)return Alert.alert('LiDAR Measurement',lidarReason);router.push('/lidar-measure' as any)};
 const openThread=()=>{if(!result)return Alert.alert('Hardware Scanner','Identify the part first.');if(result.kind!=='FASTENER')return Alert.alert('Thread Measurement','Close-up pitch/TPI measurement is enabled when RepairPilot identifies a threaded fastener.');router.push('/thread-measure' as any)};
 const openReplacement=()=>{if(!result)return Alert.alert('Replacement Match','Identify the part first.');router.push('/replacement-match' as any)};
 const startOver=async()=>{setImage(null);setResult(null);setStatus(lidarAvailable?'CENTER PART • CHECK FOCUS • TAP START SCAN':'LiDAR UNAVAILABLE • USE TAKE PHOTO OR LIBRARY');await AsyncStorage.multiRemove([PENDING_SCAN_KEY,PENDING_DEPTH_KEY])};
 const metricHardware=()=>{
   if(!result)return false;
   const text=`${result.identified_part||''} ${result.standard||''} ${(result.markings||[]).join(' ')}`;
   return /\bmetric\b|\bM\d+(?:[xX×]\d+(?:\.\d+)?)?\b|\bISO\s*\d+\b|\bDIN\s*\d+\b|\bJIS\b/i.test(text);
 };
 const displayDim=(label:string,value:number|null|undefined)=>{
   if(value==null)return null;
   const metric=metricHardware();
   const shown=metric?`${Math.round(value*100)/100} mm`:`${(value/25.4).toFixed(3)} in`;
   return <View style={s.measure}><Text style={s.measureLabel}>{label}</Text><Text style={s.measureValue}>{shown}</Text></View>;
 };
 const displayThread=()=>{
   if(!result)return null;
   if(metricHardware()&&result.measurements?.thread_pitch_mm!=null)return <View style={s.measure}><Text style={s.measureLabel}>THREAD PITCH</Text><Text style={s.measureValue}>{Math.round(result.measurements.thread_pitch_mm*100)/100} mm</Text></View>;
   if(result.measurements?.threads_per_inch!=null)return <View style={s.measure}><Text style={s.measureLabel}>THREADS</Text><Text style={s.measureValue}>{Math.round(result.measurements.threads_per_inch*100)/100} TPI</Text></View>;
   return null;
 };
 const Panel=({children,style}:{children:any,style?:any})=><ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={[s.panel,style]} imageStyle={s.panelImage}><View style={s.panelShade}/>{children}</ImageBackground>;
 const showLivePreview=!busy&&!image&&!result&&cameraPermission;

 return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={s.bg} imageStyle={s.bgImage}><View style={s.shade}/>
  <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.hit}><MaterialCommunityIcons name="chevron-left" size={28} color="#eee9df"/></TouchableOpacity><Text style={s.title}>HARDWARE SCANNER</Text><TouchableOpacity style={s.hit} onPress={()=>Alert.alert('Automatic Hardware Scanner','Use the live camera view to center the part and confirm focus/angle. When it looks good, tap START SCAN. RepairPilot then captures the camera image and LiDAR depth together, identifies the part, and applies trustworthy measurements. Imperial is displayed by default unless the part is identified as metric.')}><MaterialCommunityIcons name="information-outline" size={20} color="#eee9df"/></TouchableOpacity></View>
  <ScrollView contentContainerStyle={s.wrap}>
   <View style={s.autoBanner}><MaterialCommunityIcons name="cube-scan" size={22} color="#ffad00"/><View style={{flex:1}}><Text style={s.autoTitle}>CAMERA + LiDAR AUTO MEASURE</Text><Text style={s.autoSub}>{lidarAvailable?'Center the part, make sure it is sharp, then tap START SCAN.':lidarReason}</Text></View><View style={[s.dot,lidarAvailable&&s.dotOn]}/></View>
   <Panel style={s.frame}>
    {showLivePreview?<RepairPilotLidarPreview style={StyleSheet.absoluteFill}/>:null}
    {image?<Image source={{uri:image.uri}} style={s.photo}/>:null}
    {!showLivePreview&&!image&&!busy?<View style={s.empty}><MaterialCommunityIcons name="camera-off-outline" size={52} color="#ffad00"/><Text style={s.emptyTitle}>CAMERA PREVIEW UNAVAILABLE</Text><Text style={s.emptySub}>Use Take Photo or Library below</Text></View>:null}
    {showLivePreview?<View pointerEvents="none" style={s.liveOverlay}><Text style={s.ready}>{status}</Text><View style={s.target}><View style={[s.corner,s.c1]}/><View style={[s.corner,s.c2]}/><View style={[s.corner,s.c3]}/><View style={[s.corner,s.c4]}/></View><Text style={s.liveHint}>Keep the entire part inside the frame</Text></View>:null}
    {busy?<View style={s.busy}><ActivityIndicator size="large" color="#ffad00"/><Text style={s.busyText}>{status}</Text></View>:null}
   </Panel>
   <TouchableOpacity style={[s.autoButton,(!lidarAvailable||busy||!cameraPermission)&&s.disabled]} disabled={!lidarAvailable||busy||!cameraPermission} onPress={runAutoScan}><MaterialCommunityIcons name="scan-helper" size={23} color="#111"/><Text style={s.autoButtonText}>{result?'SCAN AGAIN':'START SCAN'}</Text></TouchableOpacity>
   <View style={s.cameraControls}><TouchableOpacity style={s.manual} disabled={busy} onPress={capture}><MaterialCommunityIcons name="camera-outline" size={22} color="#eee9df"/><Text style={s.manualText}>TAKE PHOTO</Text></TouchableOpacity><TouchableOpacity style={s.manual} disabled={busy} onPress={choose}><MaterialCommunityIcons name="image-multiple-outline" size={22} color="#eee9df"/><Text style={s.manualText}>LIBRARY</Text></TouchableOpacity></View>
   <TouchableOpacity style={[s.precision,(!lidarAvailable||!result)&&s.disabled]} disabled={busy} onPress={openLidar}><MaterialCommunityIcons name="ruler-square-compass" size={22} color={lidarAvailable&&result?'#ffad00':'#666'}/><View style={{flex:1}}><Text style={s.precisionTitle}>MANUAL LiDAR DIMENSION</Text><Text style={s.precisionSub}>{!result?'Available after identification if you want to verify a dimension.':lidarReason}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#92918a"/></TouchableOpacity>
   <TouchableOpacity style={[s.precision,(!result||result.kind!=='FASTENER')&&s.disabled]} disabled={busy} onPress={openThread}><MaterialCommunityIcons name="screw-flat-top" size={22} color={result?.kind==='FASTENER'?'#ffad00':'#666'}/><View style={{flex:1}}><Text style={s.precisionTitle}>VERIFY THREAD PITCH / TPI</Text><Text style={s.precisionSub}>{!result?'RepairPilot enables this when a threaded fastener is identified.':result.kind!=='FASTENER'?'Not needed for this identified part type.':'Use a close-up if automatic evidence is insufficient.'}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color="#92918a"/></TouchableOpacity>
   {result?<Panel style={s.result}><View style={s.resultHead}><View style={{flex:1}}><Text style={s.kicker}>AUTOMATIC SCAN RESULT • {result.kind}</Text><Text style={s.part}>{result.identified_part||'Not identified with enough confidence'}</Text></View><View style={s.match}><Text style={s.matchText}>{Math.round((result.confidence||0)*100)}% MATCH</Text></View></View>{result.standard?<Text style={s.standard}>{result.standard}</Text>:null}<View style={s.unitsBadge}><Text style={s.unitsText}>{metricHardware()?'METRIC HARDWARE • mm':'IMPERIAL DISPLAY • in'}</Text></View><View style={s.measureGrid}>{displayDim('DIAMETER',result.measurements?.diameter_mm)}{displayDim('LENGTH',result.measurements?.length_mm)}{displayDim('WIDTH',result.measurements?.width_mm)}{displayDim('HEIGHT',result.measurements?.height_mm)}{displayThread()}</View>{result.markings?.length?<Text style={s.notes}>MARKINGS: {result.markings.join(' • ')}</Text>:null}{result.warnings?.length?<Text style={s.warning}>{result.warnings[0]}</Text>:null}<TouchableOpacity style={s.find} onPress={openReplacement}><Text style={s.findText}>FIND REPLACEMENTS</Text><MaterialCommunityIcons name="chevron-right" size={20} color="#111"/></TouchableOpacity><TouchableOpacity style={s.newScan} onPress={startOver}><Text style={s.newScanText}>START NEW SCAN</Text></TouchableOpacity></Panel>:null}
  </ScrollView>
 </ImageBackground></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#050607'},bg:{flex:1},bgImage:{opacity:.94},shade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.18)'},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,backgroundColor:'rgba(4,5,6,.89)',borderBottomWidth:1.5,borderBottomColor:'#a86b00'},hit:{width:42,height:42,alignItems:'center',justifyContent:'center'},title:{color:'#eee9df',fontFamily:heavy,fontWeight:'900',fontSize:20,letterSpacing:.4},wrap:{paddingHorizontal:14,paddingTop:10,paddingBottom:30},
 panel:{overflow:'hidden',borderWidth:1.4,borderColor:'#895b0b',backgroundColor:'rgba(10,11,11,.84)'},panelImage:{opacity:.25},panelShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(4,5,6,.43)'},autoBanner:{minHeight:62,borderWidth:1,borderColor:'#725713',backgroundColor:'rgba(10,11,11,.88)',padding:10,flexDirection:'row',alignItems:'center',gap:9,marginBottom:9},autoTitle:{color:'#ffad00',fontFamily:heavy,fontWeight:'900',fontSize:12,letterSpacing:.5},autoSub:{color:'#b8b2a8',fontFamily:condensed,fontSize:10,marginTop:2},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#633'},dotOn:{backgroundColor:'#62c957'},
 frame:{height:390,borderColor:'#ffad00',borderWidth:1.7,backgroundColor:'#000'},photo:{...StyleSheet.absoluteFill,width:'100%',height:'100%',resizeMode:'contain',backgroundColor:'#000'},empty:{flex:1,alignItems:'center',justifyContent:'center'},emptyTitle:{color:'#eee9df',fontFamily:heavy,fontWeight:'900',fontSize:15,marginTop:8},emptySub:{color:'#aaa69e',fontFamily:condensed,fontSize:11,marginTop:3},liveOverlay:{...StyleSheet.absoluteFill,alignItems:'center'},ready:{position:'absolute',top:13,color:'#a7ef92',fontFamily:heavy,fontWeight:'900',fontSize:9,borderWidth:1,borderColor:'#4a8b3b',backgroundColor:'rgba(0,0,0,.62)',paddingHorizontal:8,paddingVertical:4},target:{position:'absolute',left:22,right:22,top:58,bottom:54},liveHint:{position:'absolute',bottom:15,color:'#eee9df',fontFamily:condensed,fontSize:11,backgroundColor:'rgba(0,0,0,.6)',paddingHorizontal:8,paddingVertical:4},busy:{...StyleSheet.absoluteFill,backgroundColor:'rgba(3,4,5,.76)',alignItems:'center',justifyContent:'center'},busyText:{color:'#eee9df',fontFamily:heavy,fontWeight:'900',fontSize:11,marginTop:8},corner:{position:'absolute',width:34,height:34,borderColor:'#ffad00'},c1:{left:0,top:0,borderLeftWidth:2,borderTopWidth:2},c2:{right:0,top:0,borderRightWidth:2,borderTopWidth:2},c3:{left:0,bottom:0,borderLeftWidth:2,borderBottomWidth:2},c4:{right:0,bottom:0,borderRightWidth:2,borderBottomWidth:2},
 autoButton:{height:54,marginTop:9,backgroundColor:'#ffad00',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},autoButtonText:{color:'#111',fontFamily:heavy,fontWeight:'900',fontSize:13,letterSpacing:.6},cameraControls:{height:66,flexDirection:'row',gap:9,marginTop:8},manual:{flex:1,borderWidth:1,borderColor:'#685e4c',backgroundColor:'rgba(11,12,12,.88)',alignItems:'center',justifyContent:'center'},manualText:{color:'#d8d3ca',fontFamily:heavy,fontWeight:'900',fontSize:9,marginTop:2},
 precision:{marginTop:8,borderWidth:1,borderColor:'#6b6253',backgroundColor:'rgba(12,13,13,.87)',padding:11,flexDirection:'row',gap:9,alignItems:'center'},precisionTitle:{color:'#ddd8cf',fontFamily:heavy,fontWeight:'900',fontSize:11},precisionSub:{color:'#99958d',fontFamily:condensed,fontSize:9.5,marginTop:2},disabled:{opacity:.5},result:{marginTop:10,padding:12},resultHead:{flexDirection:'row',gap:10},kicker:{color:'#ffad00',fontFamily:heavy,fontWeight:'900',fontSize:9,letterSpacing:.8},part:{color:'#f0ece4',fontFamily:heavy,fontWeight:'900',fontSize:20,marginTop:4},match:{borderWidth:1,borderColor:'#3c7436',backgroundColor:'rgba(23,55,20,.84)',paddingHorizontal:8,paddingVertical:5,alignSelf:'flex-start'},matchText:{color:'#98e685',fontFamily:heavy,fontWeight:'900',fontSize:9},standard:{color:'#ccc7be',fontFamily:condensed,fontSize:12,marginTop:5},unitsBadge:{alignSelf:'flex-start',borderWidth:1,borderColor:'#66521d',backgroundColor:'rgba(60,43,10,.65)',paddingHorizontal:7,paddingVertical:3,marginTop:8},unitsText:{color:'#d7bd7b',fontFamily:heavy,fontWeight:'900',fontSize:8,letterSpacing:.4},measureGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},measure:{width:'48.8%',borderWidth:1,borderColor:'#5f574a',backgroundColor:'rgba(10,11,11,.9)',padding:9},measureLabel:{color:'#98938a',fontFamily:heavy,fontWeight:'900',fontSize:8},measureValue:{color:'#eee9df',fontFamily:heavy,fontWeight:'900',fontSize:15,marginTop:3},notes:{color:'#c8c2b8',fontFamily:condensed,fontSize:10,marginTop:9},warning:{color:'#d5b16b',fontFamily:condensed,fontSize:9.5,marginTop:7},find:{marginTop:10,minHeight:48,backgroundColor:'#ffad00',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},findText:{color:'#111',fontFamily:heavy,fontWeight:'900',fontSize:12},newScan:{marginTop:7,minHeight:43,borderWidth:1,borderColor:'#746b5b',alignItems:'center',justifyContent:'center'},newScanText:{color:'#d8d3ca',fontFamily:heavy,fontWeight:'900',fontSize:9}
});
