import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,ImageBackground,Pressable,SafeAreaView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {arAvailability,captureARLiveSnapshot,captureARTargetSnapshot,clearARAnchors,placeDepthARAnchor,projectARAnchor,startARSession,stopARSession} from '../src/arGuidance';

type AnchorState={id:string;confidence:number;x:number;y:number;visible:boolean;depth:number};
type ViewSize={width:number;height:number};

export default function ARAssistRoute(){
  const [available,setAvailable]=useState<boolean|null>(null);
  const [depthAvailable,setDepthAvailable]=useState(false);
  const [reason,setReason]=useState('Checking ARKit support…');
  const [running,setRunning]=useState(false);
  const [targeting,setTargeting]=useState(false);
  const [snapshot,setSnapshot]=useState<any>(null);
  const [anchor,setAnchor]=useState<AnchorState|null>(null);
  const [busy,setBusy]=useState(false);
  const [viewSize,setViewSize]=useState<ViewSize>({width:0,height:0});
  const refreshBusy=useRef(false);

  const snapshotAspect=snapshot?.width>0&&snapshot?.height>0?snapshot.width/snapshot.height:4/3;

  useEffect(()=>{
    arAvailability().then(a=>{setAvailable(a.available);setDepthAvailable(a.depthAvailable);setReason(a.reason||'ARKit is ready.')});
    return()=>{stopARSession().catch(()=>{})};
  },[]);

  useEffect(()=>{
    if(!running||!anchor||targeting||viewSize.width<=0||viewSize.height<=0)return;
    const timer=setInterval(async()=>{
      if(refreshBusy.current)return;
      refreshBusy.current=true;
      try{
        const [frame,projection]=await Promise.all([
          captureARLiveSnapshot(),
          projectARAnchor(anchor.id,viewSize.width,viewSize.height)
        ]);
        setSnapshot(frame);
        setAnchor(current=>current?{...current,x:projection.x,y:projection.y,visible:projection.visible,depth:projection.depth}:current);
      }catch{}finally{refreshBusy.current=false}
    },800);
    return()=>clearInterval(timer);
  },[running,anchor?.id,targeting,viewSize.width,viewSize.height]);

  const start=async()=>{
    if(!available)return Alert.alert('AR Assistant',reason);
    setBusy(true);
    try{
      const result=await startARSession();
      setRunning(true);setDepthAvailable(result.depthAvailable);setAnchor(null);
      if(!result.depthAvailable)Alert.alert('AR Assistant','This device can run AR tracking, but RepairPilot needs scene depth for reliable equipment-surface anchoring.');
      else await captureTarget();
    }catch(e:any){Alert.alert('AR Assistant',e?.message||'Could not start ARKit.')}finally{setBusy(false)}
  };

  const captureTarget=async()=>{
    if(!running&&!available)return;
    setBusy(true);
    try{
      const frame=await captureARTargetSnapshot();
      setSnapshot(frame);setTargeting(true);setAnchor(null);
      await clearARAnchors();
    }catch(e:any){Alert.alert('AR Targeting',e?.message||'A depth-aligned AR frame could not be captured.')}finally{setBusy(false)}
  };

  const place=async(event:any)=>{
    if(!targeting||busy||viewSize.width<=0||viewSize.height<=0)return;
    const {locationX,locationY}=event.nativeEvent;
    const point={x:Math.max(0,Math.min(1,locationX/viewSize.width)),y:Math.max(0,Math.min(1,locationY/viewSize.height))};
    setBusy(true);
    try{
      const placed=await placeDepthARAnchor(point);
      const projection=await projectARAnchor(placed.id,viewSize.width,viewSize.height);
      setAnchor({id:placed.id,confidence:Number(placed.confidence)||0,x:projection.x,y:projection.y,visible:projection.visible,depth:projection.depth});
      setTargeting(false);
    }catch(e:any){Alert.alert('AR Anchor','Depth at that point was not reliable enough. Aim at a solid, non-reflective component surface and try again.')}finally{setBusy(false)}
  };

  const clear=async()=>{
    await clearARAnchors().catch(()=>{});setAnchor(null);setTargeting(false);
  };

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} style={s.bg} resizeMode="cover" imageStyle={{opacity:.82}}>
    <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.hit}><MaterialCommunityIcons name="chevron-left" size={30} color="#f4f4f0"/></TouchableOpacity><Text style={s.title}>AR REPAIR ASSISTANT</Text><View style={s.hit}/></View>
    <View style={s.wrap}>
      <View style={[s.status,available===false&&s.statusOff]}><MaterialCommunityIcons name="cube-scan" size={23} color={available?'#ffb000':'#777'}/><View style={{flex:1}}><Text style={s.statusTitle}>{available===null?'CHECKING AR…':available?depthAvailable?'AR + DEPTH READY':'AR TRACKING READY':'AR UNAVAILABLE'}</Text><Text style={s.statusText}>{reason}</Text></View></View>

      <View style={s.instruction}><Text style={s.kicker}>{targeting?'PLACE GUIDANCE ANCHOR':anchor?'SPATIAL GUIDANCE LOCKED':'START SPATIAL GUIDANCE'}</Text><Text style={s.body}>{targeting?'Tap the exact component point where the repair instruction should stay attached.':anchor?'Move the phone slightly. RepairPilot re-projects the saved world anchor as the camera pose changes.':'Start AR, aim at the component, then capture a depth-aligned targeting frame.'}</Text></View>

      <View onLayout={event=>{const {width,height}=event.nativeEvent.layout;if(width>0&&height>0&&(Math.abs(width-viewSize.width)>.5||Math.abs(height-viewSize.height)>.5))setViewSize({width,height});}} style={[s.cameraShell,{aspectRatio:snapshotAspect}]}>
        {snapshot?<Pressable disabled={!targeting} onPress={place} style={s.camera}><Image source={{uri:snapshot.imageUri}} style={s.cameraImage} resizeMode="stretch"/>{targeting?<View pointerEvents="none" style={s.targetPrompt}><Text style={s.targetPromptText}>TAP COMPONENT TO ANCHOR</Text></View>:null}{anchor&&anchor.visible&&viewSize.width>0&&viewSize.height>0?<View pointerEvents="none" style={[s.anchor,{left:anchor.x*viewSize.width-62,top:anchor.y*viewSize.height-28}]}><View style={s.anchorPin}><MaterialCommunityIcons name="wrench-outline" size={17} color="#111"/></View><View style={s.anchorLabel}><Text style={s.anchorTitle}>REPAIR STEP</Text><Text style={s.anchorText}>GUIDANCE ANCHOR</Text></View></View>:null}{anchor&&!anchor.visible?<View pointerEvents="none" style={s.offscreen}><Text style={s.offscreenText}>ANCHOR IS OUTSIDE THE CURRENT VIEW</Text></View>:null}</Pressable>:<View style={s.empty}><MaterialCommunityIcons name="cube-scan" size={62} color="#ffb000"/><Text style={s.emptyTitle}>AR CAMERA NOT STARTED</Text><Text style={s.emptyText}>The native AR session will provide spatial tracking and scene-depth evidence on supported devices.</Text></View>}
        {busy?<View style={s.busy}><ActivityIndicator size="large"/><Text style={s.busyText}>PROCESSING AR FRAME…</Text></View>:null}
      </View>

      {anchor?<View style={s.anchorInfo}><Text style={s.anchorInfoTitle}>WORLD ANCHOR ACTIVE</Text><Text style={s.anchorInfoText}>Depth confidence {Math.round(anchor.confidence*100)}% • current camera distance {anchor.depth>0?`${(anchor.depth*1000).toFixed(0)} mm`:'—'}</Text></View>:null}

      <View style={s.actions}>{!running?<TouchableOpacity disabled={!available||busy} onPress={start} style={[s.primary,(!available||busy)&&s.disabled]}><MaterialCommunityIcons name="play" size={21} color="#111"/><Text style={s.primaryText}>START AR</Text></TouchableOpacity>:<TouchableOpacity disabled={busy||!depthAvailable} onPress={captureTarget} style={[s.primary,(busy||!depthAvailable)&&s.disabled]}><MaterialCommunityIcons name="target" size={21} color="#111"/><Text style={s.primaryText}>{anchor?'PLACE NEW ANCHOR':'CAPTURE TARGET FRAME'}</Text></TouchableOpacity>}{anchor?<TouchableOpacity disabled={busy} onPress={clear} style={s.secondary}><MaterialCommunityIcons name="delete-outline" size={20} color="#ffb000"/><Text style={s.secondaryText}>CLEAR</Text></TouchableOpacity>:null}</View>

      <View style={s.note}><MaterialCommunityIcons name="shield-check-outline" size={19} color="#ffb000"/><Text style={s.noteText}>RepairPilot only places depth-based component anchors when ARKit supplies usable scene depth. Camera orientation, overlay alignment and anchor drift still require physical-device validation before this is treated as production repair guidance.</Text></View>
    </View>
  </ImageBackground></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#090b0d'},bg:{flex:1},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,backgroundColor:'rgba(8,10,11,.9)',borderBottomWidth:1,borderBottomColor:'rgba(255,179,0,.45)'},hit:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{color:'#f4f4f0',fontWeight:'900',fontSize:17,letterSpacing:.7},wrap:{padding:14,alignItems:'center'},status:{width:'100%',flexDirection:'row',gap:10,alignItems:'center',borderWidth:1,borderColor:'#8b670f',backgroundColor:'rgba(42,34,14,.95)',padding:11},statusOff:{borderColor:'#4c5153',backgroundColor:'rgba(22,24,25,.95)'},statusTitle:{color:'#fff',fontWeight:'900',fontSize:11},statusText:{color:'#b8bcbd',fontSize:10,marginTop:2},instruction:{width:'100%',marginTop:9,borderWidth:1,borderColor:'#43494b',backgroundColor:'rgba(14,17,18,.96)',padding:10},kicker:{color:'#ffb000',fontWeight:'900',fontSize:10,letterSpacing:.8},body:{color:'#c3c7c8',fontSize:11,lineHeight:17,marginTop:4},cameraShell:{width:'100%',maxWidth:560,marginTop:9,borderWidth:2,borderColor:'#ffb000',backgroundColor:'#080a0b',overflow:'hidden'},camera:{flex:1},cameraImage:{...StyleSheet.absoluteFill},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:28},emptyTitle:{color:'#fff',fontWeight:'900',marginTop:7},emptyText:{color:'#9fa5a7',fontSize:10,lineHeight:16,textAlign:'center',marginTop:5},busy:{...StyleSheet.absoluteFill,backgroundColor:'rgba(4,6,7,.72)',alignItems:'center',justifyContent:'center'},busyText:{color:'#fff',fontWeight:'900',fontSize:10,marginTop:9},targetPrompt:{position:'absolute',top:8,left:8,right:8,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(6,8,9,.78)',padding:6},targetPromptText:{color:'#ffd36b',fontSize:9,fontWeight:'900',textAlign:'center'},anchor:{position:'absolute',width:124,flexDirection:'row',alignItems:'center'},anchorPin:{width:34,height:34,borderRadius:17,backgroundColor:'#ffb000',borderWidth:2,borderColor:'#111',alignItems:'center',justifyContent:'center'},anchorLabel:{flex:1,marginLeft:-3,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(7,9,10,.9)',paddingVertical:5,paddingLeft:7,paddingRight:4},anchorTitle:{color:'#ffb000',fontSize:7,fontWeight:'900'},anchorText:{color:'#fff',fontSize:8,fontWeight:'900',marginTop:1},offscreen:{position:'absolute',left:8,right:8,bottom:8,borderWidth:1,borderColor:'#8d650d',backgroundColor:'rgba(57,43,14,.9)',padding:6},offscreenText:{color:'#ffd36b',fontSize:8,fontWeight:'900',textAlign:'center'},anchorInfo:{width:'100%',marginTop:8,borderWidth:1,borderColor:'#41683d',backgroundColor:'rgba(22,48,22,.86)',padding:9},anchorInfoTitle:{color:'#9fe593',fontSize:9,fontWeight:'900'},anchorInfoText:{color:'#c8edc3',fontSize:10,marginTop:3},actions:{width:'100%',flexDirection:'row',gap:8,marginTop:9},primary:{flex:1,minHeight:50,backgroundColor:'#ffb000',flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center'},primaryText:{color:'#111',fontWeight:'900',fontSize:11},secondary:{minWidth:92,minHeight:50,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(20,22,23,.97)',flexDirection:'row',gap:5,alignItems:'center',justifyContent:'center',paddingHorizontal:9},secondaryText:{color:'#ffd36b',fontWeight:'900',fontSize:10},disabled:{opacity:.45},note:{width:'100%',marginTop:9,flexDirection:'row',gap:8,borderWidth:1,borderColor:'#4d5355',backgroundColor:'rgba(14,17,18,.96)',padding:9},noteText:{color:'#aeb4b5',fontSize:9,lineHeight:14,flex:1}
});
