import React,{useState} from 'react';
import {Modal,Pressable,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {Stack,router,usePathname} from 'expo-router';
import {MaterialCommunityIcons} from '@expo/vector-icons';

const AMBER='#ffb000';

export default function Layout(){
  const [open,setOpen]=useState(false);
  const pathname=usePathname();
  const go=(path:string)=>{setOpen(false);router.replace(path as any)};

  return <View style={s.root}>
    <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#050607'}}}/>

    {/* The dashboard artwork includes a hamburger in the upper-left. This hit target
        sits over that location so the control is functional on the native build. */}
    {pathname==='/'?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open RepairPilot menu" style={s.menuHit} onPress={()=>setOpen(true)} activeOpacity={.7}><MaterialCommunityIcons name="menu" size={27} color="#f3f3ef"/></TouchableOpacity>:null}

    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={s.modalRoot}>
        <Pressable style={s.scrim} onPress={()=>setOpen(false)}/>
        <View style={s.drawer}>
          <View style={s.drawerHead}>
            <Text style={s.brand}>REPAIR<Text style={s.amber}>PILOT</Text></Text>
            <TouchableOpacity style={s.closeHit} onPress={()=>setOpen(false)}><MaterialCommunityIcons name="close" size={25} color="#f3f3ef"/></TouchableOpacity>
          </View>
          <Text style={s.tag}>DIAGNOSE. REPAIR. DONE RIGHT.</Text>
          <View style={s.rule}/>
          <DrawerItem icon="home" label="HOME" onPress={()=>go('/')}/>
          <DrawerItem icon="line-scan" label="HARDWARE SCANNER" onPress={()=>go('/hardware-scanner')}/>
          <DrawerItem icon="cube-scan" label="AR REPAIR ASSISTANT" onPress={()=>go('/ar-assist')}/>
          <View style={s.noteBox}><Text style={s.noteTitle}>REPAIRPILOT MENU</Text><Text style={s.note}>Equipment, diagnostics and profile remain available from the bottom navigation while those screens are being moved to the same native route system.</Text></View>
        </View>
      </View>
    </Modal>
  </View>
}

function DrawerItem({icon,label,onPress}:{icon:any,label:string,onPress:()=>void}){
  return <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={.75}><MaterialCommunityIcons name={icon} size={23} color={AMBER}/><Text style={s.itemText}>{label}</Text><MaterialCommunityIcons name="chevron-right" size={23} color="#8d9294"/></TouchableOpacity>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#050607'},
  menuHit:{position:'absolute',left:24,top:62,width:46,height:46,alignItems:'center',justifyContent:'center',zIndex:40},
  modalRoot:{flex:1,flexDirection:'row'},scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.70)'},
  drawer:{width:'82%',maxWidth:360,height:'100%',backgroundColor:'#090b0c',borderRightWidth:1,borderRightColor:'rgba(255,176,0,.72)',paddingTop:58,paddingHorizontal:18,shadowColor:'#000',shadowOpacity:.8,shadowRadius:24,shadowOffset:{width:8,height:0}},
  drawerHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:'#f0f0ec',fontSize:30,fontWeight:'900',fontStyle:'italic',letterSpacing:-1},amber:{color:AMBER},closeHit:{width:42,height:42,alignItems:'center',justifyContent:'center'},tag:{color:'#aeb2b4',fontSize:10,fontWeight:'800',letterSpacing:1.7,marginTop:3},rule:{height:1,backgroundColor:'rgba(255,176,0,.65)',marginTop:16,marginBottom:10},
  item:{height:58,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'rgba(120,124,126,.30)'},itemText:{flex:1,color:'#f0f0ec',fontWeight:'900',fontSize:15,letterSpacing:.6},
  noteBox:{marginTop:22,borderWidth:1,borderColor:'rgba(255,176,0,.45)',backgroundColor:'rgba(19,21,22,.96)',padding:13},noteTitle:{color:AMBER,fontWeight:'900',fontSize:11,letterSpacing:.7},note:{color:'#aeb2b4',fontSize:11,lineHeight:17,marginTop:5}
});
