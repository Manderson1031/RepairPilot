import React from 'react';
import {Image,StyleSheet,View} from 'react-native';
import {Stack} from 'expo-router';

export default function Layout(){
  return <View style={s.root}>
    <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#050607'}}}/>
    <View pointerEvents="none" style={s.overlay}>
      <Image source={require('../assets/distress-overlay-v1.png')} resizeMode="cover" style={s.texture}/>
      <View style={s.edge}/>
    </View>
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#050607'},
  overlay:{...StyleSheet.absoluteFillObject,zIndex:999},
  texture:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%',opacity:.055},
  edge:{...StyleSheet.absoluteFillObject,borderWidth:1,borderColor:'rgba(137,88,5,.24)'}
});
