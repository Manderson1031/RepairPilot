import React,{useEffect,useState} from 'react';
import {SafeAreaView,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View,Alert,ActivityIndicator} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import {File,Paths} from 'expo-file-system';
import * as Linking from 'expo-linking';

const API=process.env.EXPO_PUBLIC_API_URL || 'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';
const DRAFT_KEY='repairpilot.diagnosis.draft';
const ONBOARD_KEY='repairpilot.onboarding.seen';

type Screen='loading'|'onboarding'|'auth'|'reset'|'home'|'equipment'|'diagnose'|'history'|'reviews'|'complete'|'settings';

export default function App(){
 const [token,setToken]=useState('');
 const [onboarded,setOnboarded]=useState(false);
 const [accountExport,setAccountExport]=useState('');
 const [resetToken,setResetToken]=useState(''),[newPassword,setNewPassword]=useState('');
 const [screen,setScreen]=useState<Screen>('loading');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[invite,setInvite]=useState('');
 const [equipment,setEquipment]=useState<any[]>([]);
 const [newName,setNewName]=useState(''),[newCat,setNewCat]=useState('Small engine');
 const [selected,setSelected]=useState<any>(null);
 const [symptom,setSymptom]=useState(''),[history,setHistory]=useState<any[]>([]),[last,setLast]=useState<any>(null),[visual,setVisual]=useState<any>(null);
 const [answerInput,setAnswerInput]=useState('');
 const [repairs,setRepairs]=useState<any[]>([]),[reviews,setReviews]=useState<any[]>([]);
 const [fix,setFix]=useState(''),[part,setPart]=useState(''),[notes,setNotes]=useState('');

 const authHeaders=()=>({Authorization:`Bearer ${token}`});
 const jsonHeaders=()=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});

 useEffect(()=>{rehydrate();const sub=Linking.addEventListener('url',e=>handleUrl(e.url));Linking.getInitialURL().then(u=>u&&handleUrl(u));return()=>sub.remove()},[]);
 useEffect(()=>{if(screen==='diagnose'&&selected)saveDraft()},[selected,symptom,history,last,visual,screen]);

 const handleUrl=(url:string)=>{const m=url.match(/[?&]token=([^&]+)/);if(m){setResetToken(decodeURIComponent(m[1]));setScreen('reset')}};
 const rehydrate=async()=>{
   const seen=await AsyncStorage.getItem(ONBOARD_KEY);setOnboarded(seen==='1');
   if(seen!=='1'){setScreen('onboarding');return;}
   const saved=await SecureStore.getItemAsync(TOKEN_KEY);
   if(saved){
     try{
       const r=await fetch(API+'/auth/me',{headers:{Authorization:`Bearer ${saved}`}});
       if(r.ok){setToken(saved);setScreen('home');return}
     }catch{}
     await SecureStore.deleteItemAsync(TOKEN_KEY);
   }
   setScreen('auth');
 };

 const requestReset=async()=>{if(!email.trim())return Alert.alert('RepairPilot','Enter your email first.');const r=await fetch(API+'/auth/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const j=await r.json();Alert.alert('RepairPilot',j.message||'If the account exists, reset instructions can be sent.');if(j.development_reset_link)handleUrl(j.development_reset_link)};
 const confirmReset=async()=>{const r=await fetch(API+'/auth/password-reset/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:resetToken,new_password:newPassword})});const j=await r.json();if(r.ok){setResetToken('');setNewPassword('');setScreen('auth');Alert.alert('RepairPilot','Password changed. You can log in now.')}else Alert.alert('RepairPilot',j.detail||'Reset failed')};
 const auth=async(register=false)=>{
   try{
    const body:any={email,password};if(register)body.invite_code=invite;
    const r=await fetch(API+(register?'/auth/register':'/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();if(!r.ok)throw new Error(j.detail||'Authentication failed');
    await SecureStore.setItemAsync(TOKEN_KEY,j.token);setToken(j.token);setScreen('home');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };
 const logout=async()=>{await SecureStore.deleteItemAsync(TOKEN_KEY);setToken('');setScreen('auth')};

 const saveDraft=async()=>{
   try{await AsyncStorage.setItem(DRAFT_KEY,JSON.stringify({selected,symptom,history,last,visual,savedAt:Date.now()}))}catch{}
 };
 const resumeDraft=async()=>{
   try{
    const raw=await AsyncStorage.getItem(DRAFT_KEY);if(!raw)return Alert.alert('RepairPilot','No unfinished diagnosis saved.');
    const d=JSON.parse(raw);setSelected(d.selected);setSymptom(d.symptom||'');setHistory(d.history||[]);setLast(d.last||null);setVisual(d.visual||null);setScreen('diagnose');
   }catch{Alert.alert('RepairPilot','Could not restore the saved diagnosis.')}
 };
 const clearDraft=async()=>{await AsyncStorage.removeItem(DRAFT_KEY)};

 const loadEquipment=async()=>{const r=await fetch(API+'/equipment',{headers:authHeaders()});if(r.ok)setEquipment(await r.json())};
 const addEquipment=async()=>{
   if(!newName.trim())return;
   const r=await fetch(API+'/equipment',{method:'POST',headers:jsonHeaders(),body:JSON.stringify({name:newName,category:newCat,manufacturer:'',model:'',serial:'',notes:''})});
   if(r.ok){setNewName('');await loadEquipment();}
 };
 const openEquipment=(e:any)=>{setSelected(e);setScreen('diagnose');setSymptom('');setHistory([]);setLast(null);setVisual(null)};

 const takePhoto=async()=>{
   const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted)return Alert.alert('Camera permission required');
   const result=await ImagePicker.launchCameraAsync({quality:.7});if(result.canceled)return;
   const asset=result.assets[0],fd=new FormData();fd.append('equipment_id',selected.id);
   fd.append('file',{uri:asset.uri,name:asset.fileName||'repairpilot.jpg',type:asset.mimeType||'image/jpeg'} as any);
   const r=await fetch(API+'/photos/analyze',{method:'POST',headers:authHeaders(),body:fd});const j=await r.json();
   if(r.ok)setVisual(j);else Alert.alert('Photo',j.detail||'Photo analysis failed');
 };

 const uploadManual=async()=>{
   const result=await DocumentPicker.getDocumentAsync({type:'application/pdf',copyToCacheDirectory:true});if(result.canceled)return;
   const asset=result.assets[0],fd=new FormData();fd.append('equipment_id',selected.id);
   fd.append('file',{uri:asset.uri,name:asset.name,type:asset.mimeType||'application/pdf'} as any);
   const r=await fetch(API+'/manuals/upload',{method:'POST',headers:authHeaders(),body:fd});const j=await r.json();
   Alert.alert('RepairPilot',r.ok?`Indexed ${j.pages_parsed} pages from ${j.name}`:(j.detail||'Upload failed'));
 };

 const next=async(h=history)=>{
   const body={session_id:last?.session_id||null,equipment_profile:{id:selected.id,name:selected.name,manufacturer:selected.manufacturer||'',model:selected.model||'',serial:selected.serial||'',category:selected.category||'',notes:selected.notes||''},symptom,history:h,visual_evidence:visual?[visual]:[]};
   const r=await fetch(API+'/diagnose',{method:'POST',headers:jsonHeaders(),body:JSON.stringify(body)});const j=await r.json();
   if(r.ok){setLast(j);setAnswerInput('')}else Alert.alert('RepairPilot',j.detail||'Diagnosis error');
 };
 const answer=(a:string)=>{if(!last?.next_step)return;const h=[...history,{question:last.next_step.question,answer:a,risk:last.risk.level}];setHistory(h);setAnswerInput('');next(h)};
 const submitTypedAnswer=()=>{const a=answerInput.trim();if(a)answer(a)};

 const completeRepair=async(outcome:'fixed'|'needs_work')=>{
   if(outcome==='fixed'&&!fix.trim())return Alert.alert('RepairPilot','Enter what fixed the problem before marking the repair fixed.');
   const savedSessionId=last?.session_id||'';
   const payload={session_id:savedSessionId||null,outcome,equipment_id:selected.id,equipment_name:selected.name,symptom,history,fix:fix.trim()||(outcome==='fixed'?'Fixed':'Unresolved'),part:part.trim(),notes:notes.trim()};
   const r=await fetch(API+'/repairs',{method:'POST',headers:jsonHeaders(),body:JSON.stringify(payload)});const j=await r.json();
   if(!r.ok)return Alert.alert('RepairPilot',j.detail||'Could not save repair');
   await sendFeedback(savedSessionId,outcome==='fixed',outcome==='fixed'?5:2);
   await clearDraft();setFix('');setPart('');setNotes('');setLast(null);setHistory([]);setVisual(null);setAnswerInput('');setScreen('home');
   Alert.alert('RepairPilot',outcome==='fixed'?'Confirmed fix saved to repair history.':'Repair saved as still needing work.');
 };

 const sendFeedback=async(sessionId:string,success:boolean,rating:number)=>{
   if(!sessionId)return;
   try{await fetch(API+'/feedback',{method:'POST',headers:jsonHeaders(),body:JSON.stringify({session_id:sessionId,rating,success,comment:''})})}catch{}
 };
 const loadHistory=async()=>{const r=await fetch(API+'/repairs',{headers:authHeaders()});if(r.ok)setRepairs(await r.json());setScreen('history')};
 const loadReviews=async()=>{const r=await fetch(API+'/reviews',{headers:authHeaders()});if(r.ok)setReviews(await r.json());setScreen('reviews')};

 const shareAccountExport=async()=>{
   try{
    const r=await fetch(API+'/account/export',{headers:authHeaders()});const data=await r.json();if(!r.ok)throw new Error(data.detail||'Export failed');
    const file=new File(Paths.cache,'RepairPilot_Account_Export.json');if(file.exists)file.delete();file.create();file.write(JSON.stringify(data,null,2));
    if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:'Share RepairPilot data export'});
    setAccountExport('ready');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };
 const shareReport=async(repair:any)=>{
   try{
    const r=await fetch(API+`/repairs/${repair.id}/report.pdf`,{headers:authHeaders()});if(!r.ok)throw new Error('Report download failed');
    const bytes=new Uint8Array(await r.arrayBuffer());
    const file=new File(Paths.cache,`RepairPilot_${repair.id}.pdf`);
    if(file.exists)file.delete();
    file.create();file.write(bytes);
    if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Share RepairPilot report'});
    else Alert.alert('RepairPilot','Sharing is not available on this device.');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };

 if(screen==='onboarding')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.brand}>Repair<Text style={s.green}>Pilot</Text></Text><Text style={s.title}>Diagnose it. Test it. Fix it.</Text>
  <View style={s.card}><Text style={s.tileTitle}>1. Add the machine</Text><Text style={s.muted}>Save the manufacturer, model, serial, photos and manuals so RepairPilot can keep the repair tied to the right equipment.</Text></View>
  <View style={s.card}><Text style={s.tileTitle}>2. Test one thing at a time</Text><Text style={s.muted}>RepairPilot asks for observations and measurements, then uses the result to choose the next useful test.</Text></View>
  <View style={s.card}><Text style={s.tileTitle}>3. Respect the risk level</Text><Text style={s.muted}>Green is low-risk inspection. Yellow requires extra care and correct test procedures. Red means stop and escalate rather than bypassing safety systems or working on uncontrolled energy.</Text></View>
  <TouchableOpacity style={s.primary} onPress={async()=>{await AsyncStorage.setItem(ONBOARD_KEY,'1');setOnboarded(true);setScreen('auth')}}><Text style={s.primaryText}>I understand — continue</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='reset')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.brand}>Repair<Text style={s.green}>Pilot</Text></Text><Text style={s.title}>Reset password</Text>
  <TextInput style={s.input} placeholder="New password (8+ characters)" secureTextEntry placeholderTextColor="#70858b" value={newPassword} onChangeText={setNewPassword}/>
  <TouchableOpacity style={s.primary} onPress={confirmReset}><Text style={s.primaryText}>Change password</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('auth')}><Text style={s.white}>Cancel</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='loading')return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:80}} size="large"/></SafeAreaView>;

 if(!token || screen==='auth')return <SafeAreaView style={s.safe}><StatusBar style="light"/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.brand}>Repair<Text style={s.green}>Pilot</Text></Text><Text style={s.title}>Private Beta</Text>
  <View style={s.card}><Text style={s.tileTitle}>Before you start</Text><Text style={s.muted}>RepairPilot is a diagnostic assistant, not a substitute for qualified service on hazardous equipment. Stop when the app marks a step Red. Equipment profiles, uploaded manuals, photos and repair history are stored with your account.</Text></View>
  <TextInput style={s.input} placeholder="Email" placeholderTextColor="#70858b" autoCapitalize="none" value={email} onChangeText={setEmail}/>
  <TextInput style={s.input} placeholder="Password (8+ characters)" secureTextEntry placeholderTextColor="#70858b" value={password} onChangeText={setPassword}/>
  <TextInput style={s.input} placeholder="Beta invite code (registration only)" placeholderTextColor="#70858b" autoCapitalize="characters" value={invite} onChangeText={setInvite}/>
  <TouchableOpacity style={s.primary} onPress={()=>auth(false)}><Text style={s.primaryText}>Login</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>auth(true)}><Text style={s.white}>Create beta account</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={requestReset}><Text style={s.white}>Forgot password</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='home')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.brand}>Repair<Text style={s.green}>Pilot</Text></Text>
  <View style={s.grid}>
   <TouchableOpacity style={s.tile} onPress={async()=>{await loadEquipment();setScreen('equipment')}}><Text style={s.tileTitle}>My Equipment</Text><Text style={s.muted}>Profiles, photos & manuals</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={resumeDraft}><Text style={s.tileTitle}>Resume</Text><Text style={s.muted}>Continue unfinished diagnosis</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={loadHistory}><Text style={s.tileTitle}>Repair History</Text><Text style={s.muted}>Saved fixes & reports</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={loadReviews}><Text style={s.tileTitle}>Review Queue</Text><Text style={s.muted}>Escalated cases</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={()=>setScreen('settings')}><Text style={s.tileTitle}>Account</Text><Text style={s.muted}>Privacy & data controls</Text></TouchableOpacity>
  </View>
  <TouchableOpacity style={s.secondary} onPress={logout}><Text style={s.white}>Log out</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='settings')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Account & Privacy</Text>
  <View style={s.card}><Text style={s.tileTitle}>Your RepairPilot data</Text><Text style={s.muted}>You can export your account records or permanently delete your RepairPilot account. Uploaded equipment information is tied to your account.</Text></View>
  <TouchableOpacity style={s.secondary} onPress={shareAccountExport}><Text style={s.white}>Export / share my data</Text></TouchableOpacity>
  {accountExport?<View style={s.evidence}><Text style={s.muted}>Account export created and handed to the device share sheet.</Text></View>:null}
  <TouchableOpacity style={s.secondary} onPress={()=>Alert.alert('Delete account','This permanently deletes your RepairPilot account and associated beta records.',[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:async()=>{const r=await fetch(API+'/account',{method:'DELETE',headers:authHeaders()});if(r.ok){await SecureStore.deleteItemAsync(TOKEN_KEY);await AsyncStorage.removeItem(DRAFT_KEY);setToken('');setScreen('auth')}else Alert.alert('RepairPilot','Account deletion failed')}}
  ])}><Text style={s.white}>Delete my account</Text></TouchableOpacity>
  <View style={s.card}><Text style={s.tileTitle}>Safety</Text><Text style={s.muted}>RepairPilot is an assistant. Follow manufacturer procedures and workplace lockout/tagout rules. Do not bypass guards, interlocks, emergency stops, or other safety devices. Red steps require escalation.</Text></View>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='equipment')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>My Equipment</Text>
  <TextInput style={s.input} placeholder="Equipment name" placeholderTextColor="#70858b" value={newName} onChangeText={setNewName}/>
  <TextInput style={s.input} placeholder="Category" placeholderTextColor="#70858b" value={newCat} onChangeText={setNewCat}/>
  <TouchableOpacity style={s.primary} onPress={addEquipment}><Text style={s.primaryText}>Add equipment</Text></TouchableOpacity>
  {equipment.map(e=><TouchableOpacity key={e.id} style={s.card} onPress={()=>openEquipment(e)}><Text style={s.tileTitle}>{e.name}</Text><Text style={s.muted}>{e.category}</Text><Text style={s.link}>Open repair workspace →</Text></TouchableOpacity>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='history')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Repair History</Text>
  {repairs.length===0?<Text style={s.muted}>No saved repairs yet.</Text>:repairs.map(r=><View key={r.id} style={s.card}><Text style={s.tileTitle}>{r.equipment_name}</Text><Text style={s.white}>{r.fix||'Unresolved'}</Text><Text style={s.muted}>{r.symptom}</Text><TouchableOpacity style={s.secondary} onPress={()=>shareReport(r)}><Text style={s.white}>Share PDF report</Text></TouchableOpacity></View>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='reviews')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Review Queue</Text>
  {reviews.length===0?<Text style={s.muted}>No escalated cases.</Text>:reviews.map(r=><View key={r.id} style={s.card}><Text style={s.tileTitle}>{r.risk_level.toUpperCase()} case</Text><Text style={s.muted}>{r.status}</Text></View>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='complete')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Repair Complete</Text>
  <TextInput style={s.input} placeholder="What fixed it?" placeholderTextColor="#70858b" value={fix} onChangeText={setFix}/>
  <TextInput style={s.input} placeholder="Part used (optional)" placeholderTextColor="#70858b" value={part} onChangeText={setPart}/>
  <TextInput style={[s.input,{minHeight:100}]} multiline placeholder="Notes" placeholderTextColor="#70858b" value={notes} onChangeText={setNotes}/>
  <TouchableOpacity style={s.primary} onPress={()=>completeRepair('fixed')}><Text style={s.primaryText}>Fixed — save confirmed repair</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>completeRepair('needs_work')}><Text style={s.white}>Save — still needs work</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('diagnose')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>{selected?.name}</Text>
  <View style={s.row}>
   <TouchableOpacity style={s.secondaryHalf} onPress={takePhoto}><Text style={s.white}>Take Photo</Text></TouchableOpacity>
   <TouchableOpacity style={s.secondaryHalf} onPress={uploadManual}><Text style={s.white}>Add Manual</Text></TouchableOpacity>
  </View>
  {visual&&<View style={s.evidence}><Text style={s.white}>{visual.description}</Text><Text style={s.muted}>Vision confidence: {Math.round((visual.confidence||0)*100)}%</Text></View>}
  {!last?<>
   <TextInput style={[s.input,{minHeight:110}]} multiline placeholder="Describe exactly what the machine is doing" placeholderTextColor="#70858b" value={symptom} onChangeText={setSymptom}/>
   <TouchableOpacity style={s.primary} onPress={()=>symptom.trim()&&next()}><Text style={s.primaryText}>Start diagnosis</Text></TouchableOpacity>
  </>:<>
   <View style={s.card}><Text style={s.tileTitle}>RepairPilot</Text><Text style={s.white}>{last.next_step?.question||last.notes_for_record}</Text><Text style={s.muted}>Risk: {last.risk?.level?.toUpperCase()}</Text></View>
   {last.evidence?.map((e:any,i:number)=><View key={i} style={s.evidence}><Text style={s.white}>{e.source}{e.citation?` — ${e.citation}`:''}</Text><Text style={s.muted}>{e.detail||''}</Text></View>)}
   {last.next_step?.choices?.map((c:string)=><TouchableOpacity key={c} style={s.secondary} onPress={()=>answer(c)}><Text style={s.white}>{c}</Text></TouchableOpacity>)}
   {last.next_step && last.next_step.choices?.length===0 ? <>
    <TextInput style={s.input} placeholder={last.next_step.answer_type==='measurement'?`Enter measurement${last.next_step.unit?` (${last.next_step.unit})`:''}`:'Enter your answer'} placeholderTextColor="#70858b" value={answerInput} onChangeText={setAnswerInput} keyboardType={last.next_step.answer_type==='measurement'?'decimal-pad':'default'} onSubmitEditing={submitTypedAnswer}/>
    <TouchableOpacity style={s.secondary} onPress={submitTypedAnswer}><Text style={s.white}>Submit answer{last.next_step.unit?` (${last.next_step.unit})`:''}</Text></TouchableOpacity>
   </>:null}
   <TouchableOpacity style={s.primary} onPress={()=>setScreen('complete')}><Text style={s.primaryText}>Repair complete / save outcome</Text></TouchableOpacity>
  </>}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('equipment')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#07161b'},wrap:{padding:20,paddingBottom:60},brand:{fontSize:34,fontWeight:'900',color:'#fff',marginBottom:22},green:{color:'#36c45b'},
 title:{fontSize:28,fontWeight:'800',color:'#fff',marginBottom:15},muted:{color:'#9eb3aa',lineHeight:20},white:{color:'#fff',fontSize:16},link:{color:'#8ef5a6',marginTop:8},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},tile:{width:'48%',backgroundColor:'#12313a',borderColor:'#28515d',borderWidth:1,borderRadius:16,padding:16,minHeight:110},
 tileTitle:{color:'#fff',fontWeight:'800',fontSize:18,marginBottom:5},card:{backgroundColor:'#0d232a',borderColor:'#20404a',borderWidth:1,borderRadius:18,padding:17,marginTop:13},
 evidence:{backgroundColor:'#0b2b34',borderColor:'#28515d',borderWidth:1,borderRadius:12,padding:12,marginTop:10},
 input:{backgroundColor:'#0d232a',borderColor:'#20404a',borderWidth:1,borderRadius:13,padding:14,color:'#fff',fontSize:16,marginBottom:10},
 primary:{backgroundColor:'#36c45b',borderRadius:13,padding:15,marginTop:8},primaryText:{textAlign:'center',fontWeight:'900',color:'#06220e'},
 secondary:{backgroundColor:'#14333c',borderColor:'#2a4c55',borderWidth:1,borderRadius:13,padding:14,marginTop:8},
 row:{flexDirection:'row',gap:10,marginBottom:10},secondaryHalf:{flex:1,backgroundColor:'#14333c',borderColor:'#2a4c55',borderWidth:1,borderRadius:13,padding:14}
});
