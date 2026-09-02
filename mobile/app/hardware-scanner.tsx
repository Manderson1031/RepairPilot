import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,ImageBackground,SafeAreaView,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {HardwareKind,HardwareScanResult,scanHardwarePhoto} from '../src/hardwareScanner';
import {captureLidarHardware,lidarAvailability,LidarCaptureResult} from '../src/lidarScanner';

const API=process.env.EXPO_PUBLIC_API_URL||'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';
const kinds:HardwareKind[]=['FASTENER','FITTING','BEARING','OTHER'];

export default function HardwareScannerRoute(){
  const [kind,setKind]=useState<HardwareKind>('FASTENER');
  const [image,setImage]=useState<any>(null);
  const [result,setResult]=useState<HardwareScanResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [lidarBusy,setLidarBusy]=useState(false);
  const [lidarAvailable,setLidarAvailable]=useState(false);
  const [lidarReason,setLidarReason]=useState('Checking LiDAR support…');
  const [lidarResult,setLidarResult]=useState<LidarCaptureResult|null>(null);

  useEffect(()=>{lidarAvailability().then(a=>{setLidarAvailable(a.available);setLidarReason(a.reason||'ARKit LiDAR depth measurement is available on this device.')})},[]);

  const analyze=async(asset:any)=>{
    const token=await SecureStore.getItemAsync(TOKEN_KEY);
    if(!token)throw new Error('Please sign in to use Hardware Scanner.');
    setBusy(true);setResult(null);
    try{
      const scan=await scanHardwarePhoto({apiBase:API,token,uri:asset.uri,kind,fileName:asset.fileName||'hardware.jpg',mimeType:asset.mimeType||'image/jpeg'});
      setResult(scan);
    }finally{setBusy(false)}
  };

  const capture=async()=>{
    try{
      const permission=await ImagePicker.requestCameraPermissionsAsync();
      if(!permission.granted)return Alert.alert('RepairPilot','Camera permission is required for Hardware Scanner.');
      const picked=await ImagePicker.launchCameraAsync({quality:.9,mediaTypes:['images']});
      if(picked.canceled)return;
      const asset=picked.assets[0];setImage(asset);setLidarResult(null);await analyze(asset);
    }catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}
  };

  const choose=async()=>{
    try{
      const picked=await ImagePicker.launchImageLibraryAsync({quality:.9,mediaTypes:['images'],allowsMultipleSelection:false});
      if(picked.canceled)return;
      const asset=picked.assets[0];setImage(asset);setLidarResult(null);await analyze(asset);
    }catch(e:any){Alert.alert('RepairPilot',e.message||'Hardware scan failed.')}
  };

  const measureWithLidar=async()=>{
    setLidarBusy(true);setLidarResult(null);
    try{
      const depth=await captureLidarHardware();setLidarResult(depth);
      if(!depth.available&&depth.reason)Alert.alert('LiDAR Scanner',depth.reason);
    }finally{setLidarBusy(false)}
  };

  const measurement=(label:string,value:number|null|undefined,unit:string)=>value==null?null:<View style={s.measure}><Text style={s.measureLabel}>{label}</Text><Text style={s.measureValue}>{value} {unit}</Text></View>;

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={s.bg} imageStyle={{opacity:.82}}>
    <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.iconHit}><MaterialCommunityIcons name="chevron-left" size={30} color="#f4f4f0"/></TouchableOpacity><Text style={s.title}>HARDWARE SCANNER</Text><View style={s.iconHit}/></View>
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.tabs}>{kinds.map(k=><TouchableOpacity key={k} disabled={busy||lidarBusy} onPress={()=>{setKind(k);setResult(null);setLidarResult(null)}} style={[s.tab,kind===k&&s.tabActive]}><Text style={[s.tabText,kind===k&&s.tabTextActive]}>{k}</Text></TouchableOpacity>)}</View>
      <View style={s.frame}>{image?<Image source={{uri:image.uri}} style={s.photo}/>:<><MaterialCommunityIcons name="line-scan" size={58} color="#ffb000"/><Text style={s.ready}>SCAN READY</Text><Text style={s.help}>Center one piece of hardware in good light.</Text></>}{busy?<View style={s.busy}><ActivityIndicator size="large"/><Text style={s.busyText}>IDENTIFYING HARDWARE…</Text></View>:null}</View>
      <View style={s.actions}><TouchableOpacity style={s.action} disabled={busy||lidarBusy} onPress={capture}><MaterialCommunityIcons name="camera-outline" size={22} color="#111"/><Text style={s.actionText}>TAKE PHOTO</Text></TouchableOpacity><TouchableOpacity style={s.actionAlt} disabled={busy||lidarBusy} onPress={choose}><MaterialCommunityIcons name="image-outline" size={22} color="#ffb000"/><Text style={s.actionAltText}>CHOOSE PHOTO</Text></TouchableOpacity></View>
      <TouchableOpacity style={[s.lidarButton,!lidarAvailable&&s.lidarButtonDisabled]} disabled={busy||lidarBusy||!lidarAvailable} onPress={measureWithLidar}><MaterialCommunityIcons name="cube-scan" size={23} color={lidarAvailable?'#111':'#777'}/><View style={{flex:1}}><Text style={[s.lidarButtonTitle,!lidarAvailable&&s.lidarButtonTitleDisabled]}>{lidarBusy?'MEASURING WITH LiDAR…':'MEASURE WITH LiDAR'}</Text><Text style={s.lidarButtonSub}>{lidarReason}</Text></View>{lidarBusy?<ActivityIndicator size="small"/>:null}</TouchableOpacity>
      {lidarResult?.available?<View style={s.lidarResult}><View style={s.resultHead}><View><Text style={s.kicker}>LiDAR DEPTH CAPTURE</Text><Text style={s.standard}>ARKit scene-depth confidence</Text></View><Text style={s.confidence}>{Math.round((lidarResult.confidence||0)*100)}%</Text></View><View style={s.measureGrid}>{measurement('DIAMETER',lidarResult.measurements?.diameter_mm,'mm')}{measurement('LENGTH',lidarResult.measurements?.length_mm,'mm')}{measurement('WIDTH',lidarResult.measurements?.width_mm,'mm')}{measurement('HEIGHT',lidarResult.measurements?.height_mm,'mm')}{measurement('PITCH',lidarResult.measurements?.thread_pitch_mm,'mm')}</View>{lidarResult.reason?<Text style={s.body}>{lidarResult.reason}</Text>:null}<Text style={s.depthNote}>Depth measurements are kept separate until the confidence gate accepts them. Fine thread pitch still relies on close-up vision when LiDAR resolution is insufficient.</Text></View>:null}
      {result?<View style={s.result}>
        <View style={s.resultHead}><View><Text style={s.kicker}>IDENTIFICATION</Text><Text style={s.part}>{result.identified_part||'Not identified with enough confidence'}</Text></View><Text style={s.confidence}>{Math.round((result.confidence||0)*100)}%</Text></View>
        {result.standard?<Text style={s.standard}>{result.standard}</Text>:null}
        {result.markings?.length?<View style={s.section}><Text style={s.sectionTitle}>VISIBLE MARKINGS</Text><Text style={s.body}>{result.markings.join(' • ')}</Text></View>:null}
        <View style={s.measureGrid}>{measurement('DIAMETER',result.measurements?.diameter_mm,'mm')}{measurement('LENGTH',result.measurements?.length_mm,'mm')}{measurement('PITCH',result.measurements?.thread_pitch_mm,'mm')}{measurement('THREADS',result.measurements?.threads_per_inch,'TPI')}{measurement('WIDTH',result.measurements?.width_mm,'mm')}{measurement('HEIGHT',result.measurements?.height_mm,'mm')}</View>
        {result.needs_reference_scale?<View style={s.warning}><MaterialCommunityIcons name="ruler" size={21} color="#ffb000"/><Text style={s.warningText}>Exact dimensions need a trustworthy reference scale or calibrated depth measurement. RepairPilot will not guess them.</Text></View>:null}
        {result.candidate_matches?.length?<View style={s.section}><Text style={s.sectionTitle}>POSSIBLE MATCHES</Text>{result.candidate_matches.map((c:any,i:number)=><View key={i} style={s.candidate}><Text style={s.candidateName}>{c.name||`Candidate ${i+1}`}</Text>{c.reason?<Text style={s.body}>{c.reason}</Text>:null}</View>)}</View>:null}
        {result.warnings?.length?<View style={s.section}><Text style={s.sectionTitle}>NOTES</Text>{result.warnings.map((w,i)=><Text key={i} style={s.body}>• {w}</Text>)}</View>:null}
      </View>:null}
    </ScrollView>
  </ImageBackground></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#090b0d'},bg:{flex:1,backgroundColor:'#090b0d'},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,backgroundColor:'rgba(8,10,11,.88)',borderBottomWidth:1,borderBottomColor:'rgba(255,179,0,.42)'},iconHit:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{color:'#f4f4f0',fontWeight:'900',fontSize:18,letterSpacing:1},wrap:{padding:16,paddingBottom:60},tabs:{flexDirection:'row',gap:6,marginBottom:12},tab:{flex:1,paddingVertical:10,borderWidth:1,borderColor:'#676b6d',backgroundColor:'rgba(23,25,26,.94)',alignItems:'center'},tabActive:{borderColor:'#ffb000',backgroundColor:'rgba(105,72,5,.86)'},tabText:{color:'#aeb2b4',fontSize:11,fontWeight:'900'},tabTextActive:{color:'#ffd36b'},frame:{height:330,borderWidth:2,borderColor:'#ffb000',backgroundColor:'rgba(5,7,8,.93)',alignItems:'center',justifyContent:'center',overflow:'hidden'},photo:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},ready:{color:'#f4f4f0',fontSize:18,fontWeight:'900',marginTop:8},help:{color:'#aeb2b4',textAlign:'center',marginTop:6},busy:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(4,6,7,.76)',alignItems:'center',justifyContent:'center'},busyText:{color:'#fff',fontWeight:'900',marginTop:12},actions:{flexDirection:'row',gap:10,marginTop:12},action:{flex:1,backgroundColor:'#ffb000',padding:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},actionText:{color:'#111',fontWeight:'900'},actionAlt:{flex:1,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(24,25,26,.96)',padding:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},actionAltText:{color:'#ffd36b',fontWeight:'900'},lidarButton:{marginTop:10,borderWidth:1,borderColor:'#ffd05a',backgroundColor:'#ffb000',padding:12,flexDirection:'row',gap:10,alignItems:'center'},lidarButtonDisabled:{backgroundColor:'rgba(25,27,28,.96)',borderColor:'#4e5355'},lidarButtonTitle:{color:'#111',fontWeight:'900'},lidarButtonTitleDisabled:{color:'#777'},lidarButtonSub:{color:'#38320f',fontSize:10,marginTop:2},lidarResult:{marginTop:10,borderWidth:1,borderColor:'#6a7f87',backgroundColor:'rgba(12,18,20,.97)',padding:12},depthNote:{color:'#9fb1b6',fontSize:11,lineHeight:17,marginTop:10},result:{marginTop:14,borderWidth:1,borderColor:'rgba(255,179,0,.7)',backgroundColor:'rgba(18,20,21,.96)',padding:14},resultHead:{flexDirection:'row',justifyContent:'space-between',gap:12},kicker:{color:'#ffb000',fontWeight:'900',fontSize:11,letterSpacing:1.3},part:{color:'#fff',fontWeight:'900',fontSize:21,marginTop:4,maxWidth:270},confidence:{color:'#ffb000',fontWeight:'900',fontSize:20},standard:{color:'#d8dadb',marginTop:7,fontWeight:'700'},section:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'#444'},sectionTitle:{color:'#ffb000',fontWeight:'900',fontSize:12,marginBottom:6},body:{color:'#c6c9ca',lineHeight:20},measureGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:14},measure:{width:'48%',borderWidth:1,borderColor:'#4c5052',backgroundColor:'#111314',padding:10},measureLabel:{color:'#919697',fontSize:10,fontWeight:'900'},measureValue:{color:'#fff',fontWeight:'900',fontSize:17,marginTop:3},warning:{flexDirection:'row',gap:9,marginTop:14,padding:11,borderWidth:1,borderColor:'#8d650d',backgroundColor:'rgba(57,43,14,.86)'},warningText:{color:'#f1dfb2',flex:1,lineHeight:19},candidate:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#383b3c'},candidateName:{color:'#fff',fontWeight:'900',marginBottom:3}
});
