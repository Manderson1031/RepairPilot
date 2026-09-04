import React,{useMemo,useState} from 'react';
import {Alert,Image,Pressable,StyleSheet,Text,TextInput,TouchableOpacity,useWindowDimensions,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {router} from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const MASTER=require('../assets/repairpilot-v27-design-master.png');
const MASTER_W=1536, MASTER_H=1024;
const API=process.env.EXPO_PUBLIC_API_URL||'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';

type Screen='login'|'dashboard'|'equipment'|'diagnosis'|'scanner'|'scanresult'|'ar'|'history'|'maintenance';
type Crop={x:number,y:number,w:number,h:number,mode:'phone'|'panel'};

const CROPS:Record<Screen,Crop>={
 login:{x:10,y:146,w:242,h:518,mode:'phone'},dashboard:{x:260,y:146,w:255,h:518,mode:'phone'},equipment:{x:525,y:146,w:251,h:518,mode:'phone'},diagnosis:{x:783,y:146,w:240,h:518,mode:'phone'},scanner:{x:1027,y:146,w:255,h:518,mode:'phone'},scanresult:{x:1288,y:146,w:243,h:518,mode:'phone'},ar:{x:505,y:697,w:346,h:238,mode:'panel'},history:{x:868,y:697,w:339,h:238,mode:'panel'},maintenance:{x:1217,y:697,w:313,h:238,mode:'panel'},
};
const NAV:Array<[Screen,number,number,number,number]>=[['dashboard',0.02,0.885,0.14,0.10],['equipment',0.16,0.885,0.14,0.10],['diagnosis',0.30,0.885,0.14,0.10],['scanner',0.45,0.885,0.14,0.10],['ar',0.60,0.885,0.14,0.10],['maintenance',0.75,0.885,0.14,0.10]];
const SYMPTOMS=['Engine will not start','Loss of power','Overheating','Hydraulic issue','Electrical issue','Unusual noise'];
const PREVIEW_EQUIPMENT=[
 {id:'preview-cat',name:'CAT 320 Excavator',manufacturer:'Caterpillar',model:'320',serial:'CAT0320ABX2033',category:'Heavy equipment',notes:''},
 {id:'preview-deere',name:'John Deere 544K',manufacturer:'John Deere',model:'544K',serial:'1DW544KZPEF12345',category:'Heavy equipment',notes:''}
];

function CropLayer({screen,width}:{screen:Screen,width:number}){const c=CROPS[screen];const height=width/(c.w/c.h);const scale=Math.max(width/c.w,height/c.h);return <View style={[s.crop,{width,height}]}><Image source={MASTER} resizeMode="stretch" style={{position:'absolute',left:-c.x*scale,top:-c.y*scale,width:MASTER_W*scale,height:MASTER_H*scale}}/></View>}
function Hotspot({x,y,w,h,onPress,label}:{x:number,y:number,w:number,h:number,onPress:()=>void,label?:string}){return <Pressable accessibilityLabel={label} onPress={onPress} style={{position:'absolute',left:`${x*100}%`,top:`${y*100}%`,width:`${w*100}%`,height:`${h*100}%`}}/>}

export default function TargetApp(){
 const {width:vw,height:vh}=useWindowDimensions();
 const [screen,setScreen]=useState<Screen>('login');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [token,setToken]=useState('');
 const [selectedSymptom,setSelectedSymptom]=useState(0);const [selectedEquipment,setSelectedEquipment]=useState(PREVIEW_EQUIPMENT[0]);const [busy,setBusy]=useState(false);
 const phoneW=Math.min(vw,Math.round(vh*0.493));const c=CROPS[screen];const displayW=c.mode==='phone'?phoneW:Math.min(vw-16,720);const displayH=displayW/(c.w/c.h);
 const go=(to:Screen)=>setScreen(to);const showNav=c.mode==='phone'&&screen!=='login';
 const openNativeScanner=()=>router.push('/hardware-scanner');const openNativeAR=()=>router.push('/ar-assist');const openReplacementMatch=()=>router.push('/replacement-match');const openThreadMeasure=()=>router.push('/thread-measure');const openLidarMeasure=()=>router.push('/lidar-measure');
 const auth=async(register=false)=>{if(busy)return;if(!email.trim()||password.length<1)return Alert.alert('RepairPilot','Enter your email and password.');setBusy(true);try{const r=await fetch(API+(register?'/auth/register':'/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Authentication failed');await SecureStore.setItemAsync(TOKEN_KEY,j.token);setToken(j.token);go('dashboard')}catch(e:any){Alert.alert('RepairPilot',e.message||'Authentication failed')}finally{setBusy(false)}};
 const signedFetch=async(path:string,init:any={})=>{const saved=token||await SecureStore.getItemAsync(TOKEN_KEY);if(!saved)throw new Error('Please sign in first.');const r=await fetch(API+path,{...init,headers:{...(init.headers||{}),Authorization:`Bearer ${saved}`}});if(r.status===401){await SecureStore.deleteItemAsync(TOKEN_KEY);setToken('');go('login');throw new Error('Your session expired. Please sign in again.')}return r};
 const runDiagnosis=async()=>{if(busy)return;setBusy(true);try{const symptom=SYMPTOMS[selectedSymptom];const r=await signedFetch('/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:null,equipment_profile:selectedEquipment,symptom,history:[],visual_evidence:[]})});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Diagnosis error');Alert.alert('RepairPilot AI',j?.next_step?.question||j?.summary||'Diagnosis started successfully.',[{text:'Open scanner',onPress:()=>go('scanner')},{text:'OK'}])}catch(e:any){Alert.alert('RepairPilot',e.message||'Diagnosis failed')}finally{setBusy(false)}};
 const loadEquipment=async()=>{try{const r=await signedFetch('/equipment');if(!r.ok)throw new Error('Could not load equipment');const list=await r.json();if(Array.isArray(list)&&list.length){const e=list[0];setSelectedEquipment({id:e.id,name:e.name,manufacturer:e.manufacturer||'',model:e.model||'',serial:e.serial||'',category:e.category||'',notes:e.notes||''})}go('equipment')}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const loadHistory=async()=>{try{const r=await signedFetch('/repairs');if(!r.ok)throw new Error('Could not load repair history');await r.json();go('history')}catch(e:any){Alert.alert('RepairPilot',e.message)}};

 const screenHotspots=useMemo(()=>{
  if(screen==='login')return <><Hotspot x={0.08} y={0.67} w={0.84} h={0.07} label="Sign in" onPress={()=>auth(false)}/><Hotspot x={0.08} y={0.80} w={0.84} h={0.07} label="Create account" onPress={()=>auth(true)}/></>;
  if(screen==='dashboard')return <><Hotspot x={0.06} y={0.31} w={0.27} h={0.18} label="AI diagnosis" onPress={()=>go('diagnosis')}/><Hotspot x={0.36} y={0.31} w={0.27} h={0.18} label="Hardware scanner" onPress={openNativeScanner}/><Hotspot x={0.66} y={0.31} w={0.27} h={0.18} label="AR repair assistant" onPress={openNativeAR}/><Hotspot x={0.06} y={0.50} w={0.27} h={0.18} label="My equipment" onPress={loadEquipment}/><Hotspot x={0.36} y={0.50} w={0.27} h={0.18} label="My diagnostics" onPress={loadHistory}/><Hotspot x={0.66} y={0.50} w={0.27} h={0.18} label="Maintenance" onPress={()=>go('maintenance')}/></>;
  if(screen==='equipment')return <><Hotspot x={0.04} y={0.18} w={0.92} h={0.10} label="Primary equipment" onPress={()=>go('diagnosis')}/><Hotspot x={0.04} y={0.29} w={0.92} h={0.10} label="Second equipment" onPress={()=>go('diagnosis')}/></>;
  if(screen==='diagnosis')return <>{[0,1,2,3,4,5].map(i=><Pressable key={i} onPress={()=>setSelectedSymptom(i)} style={{position:'absolute',left:'6%',top:`${31+i*7.2}%`,width:'88%',height:'6.5%',borderWidth:selectedSymptom===i?1:0,borderColor:'#ffad00',borderRadius:4}}/>)}<Hotspot x={0.52} y={0.80} w={0.41} h={0.07} label="Run AI diagnosis" onPress={runDiagnosis}/></>;
  if(screen==='scanner')return <><Hotspot x={0.04} y={0.10} w={0.92} h={0.58} label="Open live hardware scanner" onPress={openNativeScanner}/><Hotspot x={0.36} y={0.72} w={0.28} h={0.11} label="Take scan" onPress={openNativeScanner}/><Hotspot x={0.68} y={0.72} w={0.24} h={0.11} label="Manual measure" onPress={openThreadMeasure}/></>;
  if(screen==='scanresult')return <><Hotspot x={0.08} y={0.80} w={0.84} h={0.07} label="Find replacements" onPress={openReplacementMatch}/><Hotspot x={0.62} y={0.08} w={0.30} h={0.10} label="LiDAR measure" onPress={openLidarMeasure}/></>;
  if(screen==='ar')return <Hotspot x={0.06} y={0.08} w={0.88} h={0.84} label="Open live AR repair assistant" onPress={openNativeAR}/>;
  return null;
 },[screen,selectedSymptom,email,password,busy,token,selectedEquipment]);

 return <View style={s.page}><StatusBar style="light"/><View style={[s.stage,{width:displayW,height:displayH}]}><CropLayer screen={screen} width={displayW}/>{screenHotspots}{showNav&&NAV.map(([to,x,y,w,h])=><Hotspot key={to} x={x} y={y} w={w} h={h} label={to} onPress={()=>to==='scanner'?openNativeScanner():to==='ar'?openNativeAR():to==='equipment'?loadEquipment():go(to)}/>)}{screen==='login'&&<View pointerEvents="box-none" style={StyleSheet.absoluteFill}><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={[s.invisibleInput,{left:'11%',top:'48.7%',width:'78%',height:'5.5%'}]}/><TextInput value={password} onChangeText={setPassword} secureTextEntry style={[s.invisibleInput,{left:'11%',top:'58.8%',width:'78%',height:'5.5%'}]}/></View>}{c.mode==='panel'&&<TouchableOpacity style={s.close} onPress={()=>go('dashboard')}><Text style={s.closeText}>‹ HOME</Text></TouchableOpacity>}</View></View>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#000',alignItems:'center',justifyContent:'center'},stage:{position:'relative',overflow:'hidden',backgroundColor:'#000'},crop:{position:'absolute',left:0,top:0,overflow:'hidden',backgroundColor:'#000'},invisibleInput:{position:'absolute',backgroundColor:'transparent',color:'transparent',borderWidth:0,padding:0},close:{position:'absolute',left:12,top:12,borderWidth:1,borderColor:'#8b5a00',backgroundColor:'rgba(0,0,0,.8)',paddingHorizontal:10,paddingVertical:6,borderRadius:4},closeText:{color:'#ffad00',fontSize:11,fontWeight:'900'}});
