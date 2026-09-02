import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,ImageBackground,SafeAreaView,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {HardwareReplacementPlan,HardwareScanResult,planHardwareReplacement} from '../src/hardwareScanner';

const API=process.env.EXPO_PUBLIC_API_URL||'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';
const PENDING_SCAN_KEY='repairpilot.hardware.pendingScan';

export default function ReplacementMatchRoute(){
  const [scan,setScan]=useState<HardwareScanResult|null>(null);
  const [plan,setPlan]=useState<HardwareReplacementPlan|null>(null);
  const [busy,setBusy]=useState(true);

  useEffect(()=>{load()},[]);

  const load=async()=>{
    setBusy(true);
    try{
      const [raw,token]=await Promise.all([AsyncStorage.getItem(PENDING_SCAN_KEY),SecureStore.getItemAsync(TOKEN_KEY)]);
      if(!raw)throw new Error('No hardware scan is available. Scan and measure the part first.');
      if(!token)throw new Error('Please sign in to use replacement matching.');
      const parsed=JSON.parse(raw) as HardwareScanResult;
      setScan(parsed);
      setPlan(await planHardwareReplacement({apiBase:API,token,scan:parsed}));
    }catch(e:any){Alert.alert('Replacement Match',e?.message||'Could not prepare replacement matching.')}finally{setBusy(false)}
  };

  const exact=!!plan?.exact_replacement_ready;
  const searchReady=!!plan?.search_ready;

  return <SafeAreaView style={s.safe}><StatusBar style="light"/><ImageBackground source={require('../assets/industrial-bg-v34.png')} style={s.bg} resizeMode="cover" imageStyle={{opacity:.82}}>
    <View style={s.top}><TouchableOpacity onPress={()=>router.back()} style={s.hit}><MaterialCommunityIcons name="chevron-left" size={30} color="#f4f4f0"/></TouchableOpacity><Text style={s.title}>REPLACEMENT MATCH</Text><View style={s.hit}/></View>
    <ScrollView contentContainerStyle={s.wrap}>
      {busy?<View style={s.loading}><ActivityIndicator size="large"/><Text style={s.loadingText}>CHECKING MEASUREMENT EVIDENCE…</Text></View>:null}
      {!busy&&plan?<>
        <View style={[s.readiness,exact?s.ready:searchReady?s.partial:s.blocked]}><MaterialCommunityIcons name={exact?'check-decagram':searchReady?'progress-check':'alert-circle-outline'} size={34} color={exact?'#9fe593':searchReady?'#ffcf62':'#ff9b7a'}/><View style={{flex:1}}><Text style={s.kicker}>REPLACEMENT READINESS</Text><Text style={s.readinessTitle}>{exact?'EXACT-SIZE SEARCH READY':searchReady?'SEARCH READY — VERIFY BEFORE BUYING':'MORE EVIDENCE NEEDED'}</Text><Text style={s.confidence}>Evidence confidence {Math.round((plan.confidence||0)*100)}%</Text></View></View>

        <View style={s.card}><Text style={s.section}>IDENTIFIED HARDWARE</Text><Text style={s.part}>{scan?.identified_part||'Hardware'}</Text>{plan.preferred_candidate?.name?<Text style={s.candidate}>{plan.preferred_candidate.name}</Text>:null}</View>

        {plan.search_query?<View style={s.card}><Text style={s.section}>REPLACEMENT SEARCH PHRASE</Text><Text style={s.query}>{plan.search_query}</Text><Text style={s.note}>This phrase is generated only from the identification, trusted measurements, confirmed thread details, and visible markings collected by RepairPilot.</Text></View>:null}

        {plan.missing_evidence?.length?<View style={s.card}><Text style={s.section}>STILL NEEDED</Text>{plan.missing_evidence.map(item=><View key={item} style={s.missingRow}><MaterialCommunityIcons name="checkbox-blank-outline" size={18} color="#ffb000"/><Text style={s.body}>{item.replaceAll('_',' ')}</Text></View>)}</View>:null}

        <View style={s.card}><Text style={s.section}>VERIFIED EVIDENCE</Text>{Object.entries(plan.evidence||{}).filter(([,value])=>value!==null&&value!==undefined&&value!==false&&(!(Array.isArray(value))||value.length)).map(([key,value])=><View key={key} style={s.evidenceRow}><Text style={s.evidenceKey}>{key.replaceAll('_',' ').toUpperCase()}</Text><Text style={s.evidenceValue}>{Array.isArray(value)?value.join(' • '):String(value)}</Text></View>)}</View>

        {plan.warning?<View style={s.warning}><MaterialCommunityIcons name="shield-alert-outline" size={22} color="#ffb000"/><Text style={s.warningText}>{plan.warning}</Text></View>:<View style={s.success}><MaterialCommunityIcons name="check-circle-outline" size={22} color="#9fe593"/><Text style={s.successText}>Critical fastener diameter, length, and thread designation are supported by trusted measurements. Replacement search can now use the resolved size.</Text></View>}

        <TouchableOpacity style={s.secondary} onPress={load}><MaterialCommunityIcons name="refresh" size={20} color="#ffb000"/><Text style={s.secondaryText}>RECHECK CURRENT SCAN</Text></TouchableOpacity>
      </>:null}
    </ScrollView>
  </ImageBackground></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#090b0d'},bg:{flex:1},top:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,backgroundColor:'rgba(8,10,11,.9)',borderBottomWidth:1,borderBottomColor:'rgba(255,179,0,.45)'},hit:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{color:'#f4f4f0',fontWeight:'900',fontSize:18,letterSpacing:.8},wrap:{padding:14,paddingBottom:60},loading:{minHeight:260,alignItems:'center',justifyContent:'center'},loadingText:{color:'#dfe1df',fontWeight:'900',fontSize:11,marginTop:12},readiness:{flexDirection:'row',gap:12,alignItems:'center',borderWidth:1,padding:13},ready:{borderColor:'#41683d',backgroundColor:'rgba(22,48,22,.9)'},partial:{borderColor:'#8d650d',backgroundColor:'rgba(57,43,14,.9)'},blocked:{borderColor:'#7e4e3b',backgroundColor:'rgba(55,29,22,.9)'},kicker:{color:'#ffb000',fontWeight:'900',fontSize:10,letterSpacing:.8},readinessTitle:{color:'#fff',fontWeight:'900',fontSize:16,marginTop:2},confidence:{color:'#aeb6b8',fontSize:10,marginTop:3},card:{marginTop:10,borderWidth:1,borderColor:'#4b5153',backgroundColor:'rgba(14,17,18,.97)',padding:12},section:{color:'#ffb000',fontSize:10,fontWeight:'900',letterSpacing:.8},part:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:5},candidate:{color:'#dce0df',fontSize:16,fontWeight:'800',marginTop:5},query:{color:'#fff',fontSize:18,fontWeight:'900',lineHeight:25,marginTop:7},note:{color:'#9fa6a8',fontSize:10,lineHeight:16,marginTop:8},missingRow:{flexDirection:'row',gap:8,alignItems:'center',paddingTop:8},body:{color:'#d2d5d5',fontSize:12},evidenceRow:{paddingVertical:7,borderBottomWidth:1,borderBottomColor:'#353a3c'},evidenceKey:{color:'#8f9698',fontSize:9,fontWeight:'900'},evidenceValue:{color:'#f1f2ef',fontSize:12,fontWeight:'700',marginTop:2},warning:{marginTop:10,flexDirection:'row',gap:9,borderWidth:1,borderColor:'#8d650d',backgroundColor:'rgba(57,43,14,.9)',padding:11},warningText:{color:'#f1dfb2',fontSize:11,lineHeight:17,flex:1},success:{marginTop:10,flexDirection:'row',gap:9,borderWidth:1,borderColor:'#41683d',backgroundColor:'rgba(22,48,22,.9)',padding:11},successText:{color:'#c8edc3',fontSize:11,lineHeight:17,flex:1},secondary:{marginTop:10,borderWidth:1,borderColor:'#ffb000',backgroundColor:'rgba(20,22,23,.97)',padding:13,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},secondaryText:{color:'#ffd36b',fontSize:11,fontWeight:'900'}
});
