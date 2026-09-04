import React from 'react';
import {ImageBackground,SafeAreaView,StyleSheet,Text,TouchableOpacity,useWindowDimensions,View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';

const AMBER='#ffad00', TEXT='#f1ede5', MUTED='#b6b1a8';
const BASE_W=234, BASE_H=493;
const cards=[
 ['brain','AI DIAGNOSIS','Start a new diagnostic'],['lightning-bolt','HARDWARE\nSCANNER','Identify hardware\n& find parts'],['cube-outline','AR REPAIR\nASSISTANT','Visual guidance\nin real world'],
 ['excavator','MY EQUIPMENT','Manage your\nequipment'],['clipboard-text-outline','MY DIAGNOSTICS','View past\ndiagnostics'],['tools','MAINTENANCE','Schedules &\nreminders']
] as const;

export default function TargetPreview(){
 const {width}=useWindowDimensions();
 const s=width/BASE_W;
 const px=(n:number)=>n*s;
 const card=(i:number)=>{const col=i%3,row=Math.floor(i/3);return {left:px(17+col*75),top:px(161+row*96),width:px(70),height:px(90)}};
 return <SafeAreaView style={st.safe}><View style={{width,height:px(BASE_H),alignSelf:'center'}}>
  <ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={StyleSheet.absoluteFill} imageStyle={{opacity:.72}}><View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(0,0,0,.38)'}]}/></ImageBackground>
  <View style={[st.header,{height:px(51),paddingHorizontal:px(14)}]}><MaterialCommunityIcons name="menu" size={px(18)} color={TEXT}/><Text style={[st.brand,{fontSize:px(18)}]}>REPAIR<Text style={{color:AMBER}}>PILOT</Text></Text><MaterialCommunityIcons name="bell-outline" size={px(17)} color={TEXT}/></View>
  <View style={{position:'absolute',left:px(18),top:px(71)}}><Text style={[st.small,{fontSize:px(9.5)}]}>Welcome back,</Text><Text style={[st.name,{fontSize:px(18)}]}>BRYAN</Text><Text style={[st.sub,{fontSize:px(8.5)}]}>Ready to diagnose and repair.</Text></View>
  <Text style={[st.section,{left:px(18),top:px(136),fontSize:px(9.2)}]}>QUICK ACTIONS</Text><View style={{position:'absolute',left:px(90),top:px(142),width:px(127),height:1,backgroundColor:'#8b5b08'}}/>
  {cards.map((c,i)=><TouchableOpacity key={i} style={[st.card,card(i)]}><MaterialCommunityIcons name={c[0] as any} size={px(22)} color={AMBER}/><Text style={[st.cardTitle,{fontSize:px(8.2),lineHeight:px(8.8)}]}>{c[1]}</Text><Text style={[st.cardSub,{fontSize:px(6.6),lineHeight:px(7.3)}]}>{c[2]}</Text></TouchableOpacity>)}
  <View style={[st.badge,{left:px(139),top:px(157),paddingHorizontal:px(4),paddingVertical:px(1)}]}><Text style={{fontSize:px(5.3),fontWeight:'900'}}>NEW</Text></View>
  <Text style={[st.section,{left:px(18),top:px(351),fontSize:px(9.2)}]}>RECENT ACTIVITY</Text><Text style={[st.viewAll,{right:px(17),top:px(351),fontSize:px(6.2)}]}>VIEW ALL</Text>
  {[['CAT 320 Excavator','Hydraulic System','COMPLETED','May 20, 2025'],['John Deere 544K','Electrical System','IN PROGRESS','May 19, 2025']].map((r,i)=><View key={i} style={[st.row,{left:px(17),top:px(367+i*40),width:px(200),height:px(35)}]}><MaterialCommunityIcons name="excavator" size={px(15)} color={AMBER}/><View style={{flex:1,marginLeft:px(5)}}><Text style={[st.rowName,{fontSize:px(7.7)}]}>{r[0]}</Text><Text style={[st.rowSub,{fontSize:px(6.3)}]}>{r[1]}</Text></View><View style={{alignItems:'flex-end'}}><Text style={{fontSize:px(5.8),fontWeight:'900',color:i? '#55b9eb':'#72d64f'}}>{r[2]}</Text><Text style={[st.rowSub,{fontSize:px(5.8)}]}>{r[3]}</Text></View></View>)}
  <View style={[st.bottom,{height:px(42)}]}>{[['home','Home'],['excavator','Equipment'],['shield-wrench-outline','Diagnosis'],['line-scan','Scanner'],['cube-scan','AR Assist'],['account-outline','Profile']].map((n,i)=><View key={i} style={{flex:1,alignItems:'center'}}><MaterialCommunityIcons name={n[0] as any} size={px(12.5)} color={i===0?AMBER:'#969792'}/><Text style={{fontSize:px(5.4),marginTop:px(1),color:i===0?AMBER:'#969792',fontWeight:'800'}}>{n[1]}</Text></View>)}</View>
 </View></SafeAreaView>
}

const st=StyleSheet.create({safe:{flex:1,backgroundColor:'#050607'},header:{position:'absolute',left:0,right:0,top:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#8b5b08',backgroundColor:'rgba(3,4,5,.72)'},brand:{color:TEXT,fontWeight:'900',fontStyle:'italic'},small:{color:'#dedbd3'},name:{color:TEXT,fontWeight:'900'},sub:{color:'#c6c1b9',marginTop:1},section:{position:'absolute',color:AMBER,fontWeight:'900'},viewAll:{position:'absolute',color:AMBER,fontWeight:'900'},card:{position:'absolute',borderWidth:1,borderColor:'#8a5b0b',backgroundColor:'rgba(7,8,8,.87)',borderRadius:3,alignItems:'center',justifyContent:'center',paddingHorizontal:3},cardTitle:{color:TEXT,fontWeight:'900',textAlign:'center',marginTop:4},cardSub:{color:MUTED,textAlign:'center',marginTop:3},badge:{position:'absolute',backgroundColor:AMBER,borderRadius:8},row:{position:'absolute',borderWidth:1,borderColor:'#6f4a0a',backgroundColor:'rgba(6,7,8,.9)',flexDirection:'row',alignItems:'center',paddingHorizontal:6},rowName:{color:TEXT,fontWeight:'900'},rowSub:{color:MUTED,marginTop:1},bottom:{position:'absolute',left:0,right:0,bottom:0,borderTopWidth:1,borderTopColor:'#654307',backgroundColor:'rgba(3,4,5,.96)',flexDirection:'row',alignItems:'center'}});