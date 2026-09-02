import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,ImageBackground,Pressable,SafeAreaView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {captureLidarSnapshot,lidarAvailability,LidarPoint,LidarPointMeasurement,measureLidarPoints,stopLidarSession} from '../src/lidarScanner';

export default function LidarMeasureRoute(){
  const [available,setAvailable]=useState<boolean|null>(null);
  const [reason,setReason]=useState('Checking ARKit scene-depth support…');
  const [snapshot,setSnapshot]=useState<any>(null);
  const [points,setPoints]=useState<LidarPoint[]>([]);
  const [measurement,setMeasurement]=useState<LidarPointMeasurement|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    lidarAvailability().then(a=>{setAvailable(a.available);setReason(a.reason||'LiDAR scene depth is available.')});
    return()=>{stopLidarSession().catch(()=>{})};
  },[]);

  const capture=async()=>{
    if(!available)return Alert.alert('LiDAR Scanner',reason);
    setBusy(true);setPoints([]);setMeasurement(null);
    try{
      const image=await captureLidarSnapshot();
      setSnapshot(image);
    }catch(e:any){Alert.alert('LiDAR Scanner',e?.message||'Could not capture a LiDAR depth frame.')}finally{setBusy(false)}
  };

  const choosePoint=async(event:any)=>{
    if(!snapshot||busy)return;
    const {locationX,locationY}=event.nativeEvent;
    const width=event.currentTarget?.offsetWidth||event.nativeEvent?.target?.width;
    const height=event.currentTarget?.offsetHeight||event.nativeEvent?.target?.height;
    // React Native does not expose DOM layout dimensions on the event. The image
    // is rendered into the fixed measurementFrame below, so use those dimensions.
    const p={x:Math.max(0,Math.min(1,locationX/MEASURE_WIDTH)),y:Math.max(0,Math.min(1,locationY/MEASURE_HEIGHT))};
    const next=points.length>=2?[p]:[...points,p];
    setPoints(next);setMeasurement(null);
    if(next.length===2){
      setBusy(true);
      try{
        const measured=await measureLidarPoints(next[0],next[1]);
        setMeasurement(measured);
      }catch(e:any){Alert.alert('LiDAR Measurement','Depth at one or both selected points was not reliable enough. Try again on clear edges with the hardware closer to the camera.')}finally{setBusy(false)}
    }
  };

  const resetPoints=()=>{setPoints([]);setMeasurement(null)};

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} style={s.bg} resizeMode="cover" imageStyle={{opacity:.82}}>
    <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.hit}><MaterialCommunityIcons name="chevron-left" size={30} color="#f4f4f0"/></TouchableOpacity><Text style={s.title}>LiDAR MEASUREMENT</Text><View style={s.hit}/></View>
    <View style={s.wrap}>
      <View style={[s.status,available===false&&s.statusOff]}><MaterialCommunityIcons name="cube-scan" size={22} color={available?'#ffb000':'#777'}/><View style={{flex:1}}><Text style={s.statusTitle}>{available===null?'CHECKING LiDAR…':available?'LiDAR READY':'LiDAR UNAVAILABLE'}</Text><Text style={s.statusText}>{reason}</Text></View></View>
      <View style={s.instructions}><Text style={s.kicker}>DEPTH-ALIGNED TWO-POINT MEASUREMENT</Text><Text style={s.body}>Capture a depth frame, then tap the two physical endpoints you want measured. RepairPilot deprojects both depth samples with the ARKit camera intrinsics and calculates the 3D distance between them.</Text></View>
      <View style={s.measureShell}>
        {snapshot?<Pressable onPress={choosePoint} style={s.measureFrame}><Image source={{uri:snapshot.imageUri}} style={s.image} resizeMode="stretch"/>{points.map((p,i)=><View key={i} pointerEvents="none" style={[s.marker,{left:p.x*MEASURE_WIDTH-9,top:p.y*MEASURE_HEIGHT-9}]}><Text style={s.markerText}>{i+1}</Text></View>)}{points.length===2?<View pointerEvents="none" style={s.frozen}><Text style={s.frozenText}>{busy?'CALCULATING 3D DISTANCE…':'DEPTH POINTS LOCKED'}</Text></View>:null}</Pressable>:<View style={s.empty}><MaterialCommunityIcons name="camera-metering-center" size={62} color="#ffb000"/><Text style={s.emptyTitle}>NO DEPTH FRAME YET</Text><Text style={s.emptyText}>Keep the hardware roughly centered and fill as much of the frame as practical.</Text></View>}
      </View>
      {measurement?<View style={s.result}><Text style={s.resultKicker}>3D LiDAR DISTANCE</Text><Text style={s.distance}>{measurement.distance_mm.toFixed(2)} mm</Text><Text style={s.confidence}>DEPTH CONFIDENCE {Math.round(measurement.confidence*100)}%</Text><Text style={s.depth}>Point depths: {(measurement.depth_m.start*1000).toFixed(0)} mm / {(measurement.depth_m.end*1000).toFixed(0)} mm</Text>{measurement.confidence<.67?<Text style={s.warning}>Low depth confidence — do not use this value for exact hardware sizing. Recapture closer and on a less reflective surface.</Text>:null}</View>:null}
      <View style={s.actions}><TouchableOpacity disabled={!available||busy} style={[s.primary,(!available||busy)&&s.disabled]} onPress={capture}>{busy?<ActivityIndicator color="#111"/>:<MaterialCommunityIcons name="cube-scan" size={22} color="#111"/>}<Text style={s.primaryText}>{snapshot?'RECAPTURE DEPTH FRAME':'CAPTURE DEPTH FRAME'}</Text></TouchableOpacity>{snapshot?<TouchableOpacity disabled={busy} style={s.secondary} onPress={resetPoints}><MaterialCommunityIcons name="target" size={20} color="#ffb000"/><Text style={s.secondaryText}>RESET POINTS</Text></TouchableOpacity>:null}</View>
      <Text style={s.note}>For bolts and fittings this tool is intended for gross dimensions such as overall length or outside diameter. Fine thread pitch/TPI still needs the close-up vision path because phone LiDAR depth resolution is not fine enough for small thread crests.</Text>
    </View>
  </ImageBackground></SafeAreaView>;
}

const MEASURE_WIDTH=360;
const MEASURE_HEIGHT=270;

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#090b0d'},bg:{flex:1},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,backgroundColor:'rgba(8,10,11,.9)',borderBottomWidth:1,borderBottomColor:'rgba(255,179,0,.45)'},hit:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{color:'#f4f4f0',fontWeight:'900',fontSize:18,letterSpacing:.8},wrap:{padding:14,alignItems:'center'},status:{width:'100%',flexDirection:'row',gap:10,alignItems:'center',borderWidth:1,borderColor:'#8b670f',backgroundColor:'rgba(42,34,14,.95)',padding:11},statusOff:{borderColor:'#4c5153',backgroundColor:'rgba(22,24,25,.95)'},statusTitle:{color:'#fff',fontWeight:'900',fontSize:12},statusText:{color:'#b8bcbd',fontSize:10,marginTop:2},instructions:{width:'100%',marginTop:10,borderWidth:1,borderColor:'#42484a',backgroundColor:'rgba(14,17,18,.96)',padding:11},kicker:{color:'#ffb000',fontWeight:'900',fontSize:11,letterSpacing:.8},body:{color:'#c4c8c9',fontSize:12,lineHeight:18,marginTop:5},measureShell:{width:MEASURE_WIDTH,height:MEASURE_HEIGHT,marginTop:10,borderWidth:2,borderColor:'#ffb000',backgroundColor:'#080a0b',overflow:'hidden'},measureFrame:{width:MEASURE_WIDTH,height:MEASURE_HEIGHT},image:{width:MEASURE_WIDTH,height:MEASURE_HEIGHT},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyTitle:{color:'#fff',fontWeight:'900',marginTop:8},emptyText:{color:'#aeb2b4',fontSize:11,textAlign:'center',marginTop:6,lineHeight:17},marker:{position:'absolute',width:18,height:18,borderRadius:9,backgroundColor:'#ffb000',borderWidth:2,borderColor:'#111',alignItems:'center',justifyContent:'center'},markerText:{fontSize:9,fontWeight:'900',color:'#111'},frozen:{position:'absolute',left:8,right:8,top:8,backgroundColor:'rgba(5,7,8,.78)',borderWidth:1,borderColor:'#ffb000',padding:6},frozenText:{color:'#ffd36b',fontSize:9,fontWeight:'900',textAlign:'center'},result:{width:'100%',marginTop:10,borderWidth:1,borderColor:'#6c7f86',backgroundColor:'rgba(12,18,20,.97)',padding:12},resultKicker:{color:'#ffb000',fontSize:10,fontWeight:'900'},distance:{color:'#fff',fontSize:31,fontWeight:'900',marginTop:2},confidence:{color:'#9fe593',fontWeight:'900',fontSize:11,marginTop:3},depth:{color:'#aeb8bb',fontSize:10,marginTop:4},warning:{color:'#ffd18a',fontSize:11,lineHeight:16,marginTop:8},actions:{width:'100%',flexDirection:'row',gap:8,marginTop:10},primary:{flex:1,minHeight:52,backgroundColor:'#ffb000',flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center'},primaryText:{color:'#111',fontWeight:'900',fontSize:11},secondary:{minWidth:120,minHeight:52,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(20,22,23,.97)',flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',paddingHorizontal:10},secondaryText:{color:'#ffd36b',fontWeight:'900',fontSize:10},disabled:{opacity:.45},note:{width:'100%',color:'#9fa5a7',fontSize:10,lineHeight:15,marginTop:10}
});
