import React,{useMemo,useState} from 'react';
import {Image,ScrollView,StyleSheet,Text,TouchableOpacity,useWindowDimensions,View} from 'react-native';

const MASTER=require('../assets/repairpilot-v27-design-master.png');
const MASTER_W=1536, MASTER_H=1024;

type ProofKey='login'|'dashboard'|'equipment'|'diagnosis'|'scanner'|'scanresult'|'ar'|'history'|'maintenance';
type Crop={label:string,x:number,y:number,w:number,h:number,mode:'phone'|'panel'};

const CROPS:Record<ProofKey,Crop>={
 login:{label:'01 LOGIN',x:10,y:146,w:242,h:518,mode:'phone'},
 dashboard:{label:'02 DASHBOARD',x:260,y:146,w:255,h:518,mode:'phone'},
 equipment:{label:'03 EQUIPMENT LIST',x:525,y:146,w:251,h:518,mode:'phone'},
 diagnosis:{label:'04 AI DIAGNOSIS',x:783,y:146,w:240,h:518,mode:'phone'},
 scanner:{label:'05 SCANNER',x:1027,y:146,w:255,h:518,mode:'phone'},
 scanresult:{label:'06 SCAN RESULT',x:1288,y:146,w:243,h:518,mode:'phone'},
 ar:{label:'AR REPAIR ASSISTANT',x:505,y:697,w:346,h:238,mode:'panel'},
 history:{label:'DIAGNOSTIC HISTORY',x:868,y:697,w:339,h:238,mode:'panel'},
 maintenance:{label:'MAINTENANCE',x:1217,y:697,w:313,h:238,mode:'panel'},
};

const KEYS=Object.keys(CROPS) as ProofKey[];

function CropView({crop,width}:{crop:Crop,width:number}){
 const targetRatio=crop.mode==='phone'?0.493:crop.w/crop.h;
 const height=crop.mode==='phone'?Math.round(width/targetRatio):Math.round(width/targetRatio);
 const sx=width/crop.w;
 const sy=height/crop.h;
 const scale=Math.max(sx,sy);
 return <View style={[s.crop,{width,height}]}>
   <Image source={MASTER} resizeMode="stretch" style={{position:'absolute',left:-crop.x*scale,top:-crop.y*scale,width:MASTER_W*scale,height:MASTER_H*scale}}/>
 </View>;
}

export default function VisualProof(){
 const {width:vw}=useWindowDimensions();
 const [active,setActive]=useState<ProofKey>('dashboard');
 const crop=CROPS[active];
 const proofW=Math.min(vw-24,420);
 const note=useMemo(()=>crop.mode==='phone'?'Exact target-board phone artwork, isolated at iPhone ratio.':'Target-board feature panel, isolated for the matching app screen.',[crop]);
 return <View style={s.page}>
   <Text style={s.title}>REPAIR<Text style={s.amber}>PILOT</Text> VISUAL PROOF</Text>
   <Text style={s.sub}>Free preview branch — no EAS build required</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
    {KEYS.map(k=><TouchableOpacity key={k} onPress={()=>setActive(k)} style={[s.tab,active===k&&s.tabOn]}><Text style={[s.tabText,active===k&&s.tabTextOn]}>{CROPS[k].label}</Text></TouchableOpacity>)}
   </ScrollView>
   <ScrollView contentContainerStyle={s.body}>
    <Text style={s.screenTitle}>{crop.label}</Text>
    <CropView crop={crop} width={proofW}/>
    <Text style={s.note}>{note}</Text>
    <Text style={s.note}>This route is intentionally visual-only so design can be approved before native build costs are incurred.</Text>
   </ScrollView>
 </View>;
}

const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#050607',paddingTop:48},
 title:{color:'#f1ede5',fontSize:22,fontWeight:'900',textAlign:'center',fontStyle:'italic'},amber:{color:'#ffad00'},
 sub:{color:'#aaa69e',textAlign:'center',fontSize:12,marginTop:4,marginBottom:10},
 tabs:{paddingHorizontal:10,gap:7,paddingBottom:10},tab:{borderWidth:1,borderColor:'#5f430d',paddingHorizontal:10,paddingVertical:7,borderRadius:4,backgroundColor:'#0a0b0c'},tabOn:{borderColor:'#ffad00'},tabText:{color:'#aaa69e',fontSize:10,fontWeight:'800'},tabTextOn:{color:'#ffad00'},
 body:{alignItems:'center',padding:12,paddingBottom:40},screenTitle:{color:'#ffad00',fontWeight:'900',fontSize:15,marginBottom:8},
 crop:{overflow:'hidden',backgroundColor:'#000',borderWidth:1,borderColor:'#7c520c'},note:{color:'#9d9992',fontSize:11,lineHeight:16,textAlign:'center',maxWidth:430,marginTop:10,paddingHorizontal:10}
});
