import React from 'react';
import {Image,StyleSheet,View} from 'react-native';
import {Stack} from 'expo-router';

export default function Layout(){
  return <View style={s.root}>
    <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#050607'}}}/>
    <View pointerEvents="none" style={s.overlay}>
      <Image source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={s.texture}/>
      <View style={s.scanlineA}/><View style={s.scanlineB}/><View style={s.vignette}/>
    </View>
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#050607'},
  overlay:{...StyleSheet.absoluteFill,zIndex:999},
  texture:{...StyleSheet.absoluteFill,width:'100%',height:'100%',opacity:.085},
  scanlineA:{...StyleSheet.absoluteFill,borderWidth:1,borderColor:'rgba(171,108,8,.18)'},
  scanlineB:{position:'absolute',left:0,right:0,top:'52%',height:1,backgroundColor:'rgba(255,176,0,.05)'},
  vignette:{...StyleSheet.absoluteFill,borderWidth:7,borderColor:'rgba(0,0,0,.18)'}
});
