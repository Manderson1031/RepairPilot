import React,{useEffect,useRef,useState} from 'react';
import {SafeAreaView,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View,Alert,ActivityIndicator,KeyboardAvoidingView,Platform,Keyboard} from 'react-native';
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
 const [newManufacturer,setNewManufacturer]=useState(''),[newModel,setNewModel]=useState(''),[newSerial,setNewSerial]=useState('');
 const [busy,setBusy]=useState('');
 const [selected,setSelected]=useState<any>(null);
 const [symptom,setSymptom]=useState(''),[history,setHistory]=useState<any[]>([]),[last,setLast]=useState<any>(null),[visual,setVisual]=useState<any>(null);
 const [answerInput,setAnswerInput]=useState('');
 const [repairs,setRepairs]=useState<any[]>([]),[reviews,setReviews]=useState<any[]>([]);
 const [fix,setFix]=useState(''),[part,setPart]=useState(''),[notes,setNotes]=useState('');
 const diagnosisScroll=useRef<ScrollView>(null);

 const authHeaders=()=>({Authorization:`Bearer ${token}`});
 const jsonHeaders=()=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});

 const signedFetch=async(path:string,init:any={})=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),25000);
   try{
    const headers={...(init.headers||{}),Authorization:`Bearer ${token}`};
    const r=await fetch(API+path,{...init,headers,signal:controller.signal});
    if(r.status===401){
      await SecureStore.deleteItemAsync(TOKEN_KEY);setToken('');setScreen('auth');
      throw new Error('Your session expired. Please log in again.');
    }
    return r;
   }catch(e:any){
    if(e?.name==='AbortError')throw new Error('RepairPilot timed out contacting the server. Check your connection and try again.');
    throw e;
   }finally{clearTimeout(timer)}
 };
 const runBusy=async(key:string,work:()=>Promise<void>)=>{if(busy)return;setBusy(key);try{await work()}finally{setBusy('')}};

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
 const confirmReset=async()=>{if(newPassword.length<8)return Alert.alert('RepairPilot','Use a password with at least 8 characters.');const r=await fetch(API+'/auth/password-reset/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:resetToken,new_password:newPassword})});const j=await r.json();if(r.ok){setResetToken('');setNewPassword('');setScreen('auth');Alert.alert('RepairPilot','Password changed. You can log in now.')}else Alert.alert('RepairPilot',j.detail||'Reset failed')};
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

 const loadEquipment=async()=>{try{const r=await signedFetch('/equipment');if(!r.ok)throw new Error('Could not load equipment');setEquipment(await r.json())}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const addEquipment=async()=>runBusy('equipment',async()=>{
   if(!newName.trim()){Alert.alert('RepairPilot','Enter an equipment name.');return}
   try{
    const r=await signedFetch('/equipment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName.trim(),category:newCat.trim(),manufacturer:newManufacturer.trim(),model:newModel.trim(),serial:newSerial.trim(),notes:''})});
    const j=await r.json();if(!r.ok)throw new Error(j.detail||'Could not add equipment');
    setNewName('');setNewManufacturer('');setNewModel('');setNewSerial('');await loadEquipment();
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });
 const openEquipment=(e:any)=>{setSelected(e);setScreen('diagnose');setSymptom('');setHistory([]);setLast(null);setVisual(null)};

 const analyzePhotoAsset=async(asset:any)=>{
   const fd=new FormData();fd.append('equipment_id',selected.id);
   fd.append('file',{uri:asset.uri,name:asset.fileName||'repairpilot.jpg',type:asset.mimeType||'image/jpeg'} as any);
   const r=await signedFetch('/photos/analyze',{method:'POST',body:fd});const j=await r.json();
   if(r.ok)setVisual(j);else throw new Error(j.detail||'Photo analysis failed');
 };
 const takePhoto=async()=>runBusy('photo',async()=>{
   try{
    const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted){Alert.alert('RepairPilot','Camera permission is required to take an equipment photo.');return}
    const result=await ImagePicker.launchCameraAsync({quality:.7,mediaTypes:['images']});if(result.canceled)return;
    await analyzePhotoAsset(result.assets[0]);
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });
 const choosePhoto=async()=>runBusy('photo',async()=>{
   try{
    const result=await ImagePicker.launchImageLibraryAsync({quality:.7,mediaTypes:['images'],allowsMultipleSelection:false});if(result.canceled)return;
    await analyzePhotoAsset(result.assets[0]);
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });

 const uploadManual=async()=>runBusy('manual',async()=>{
   const result=await DocumentPicker.getDocumentAsync({type:'application/pdf',copyToCacheDirectory:true});if(result.canceled)return;
   const asset=result.assets[0],fd=new FormData();fd.append('equipment_id',selected.id);
   fd.append('file',{uri:asset.uri,name:asset.name,type:asset.mimeType||'application/pdf'} as any);
   try{const r=await signedFetch('/manuals/upload',{method:'POST',body:fd});const j=await r.json();
   Alert.alert('RepairPilot',r.ok?`Indexed ${j.pages_parsed} pages from ${j.name}`:(j.detail||'Upload failed'))}catch(e:any){Alert.alert('RepairPilot',e.message)}
 });

 const next=async(h=history)=>runBusy('diagnose',async()=>{
   if(!selected?.id)return Alert.alert('RepairPilot','Choose an equipment profile first.');
   if(!symptom.trim())return Alert.alert('RepairPilot','Describe the symptom before starting diagnosis.');
   const body={session_id:last?.session_id||null,equipment_profile:{id:selected.id,name:selected.name,manufacturer:selected.manufacturer||'',model:selected.model||'',serial:selected.serial||'',category:selected.category||'',notes:selected.notes||''},symptom:symptom.trim(),history:h,visual_evidence:visual?[visual]:[]};
   try{const r=await signedFetch('/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();
   if(r.ok){setLast(j)}else Alert.alert('RepairPilot',j.detail||'Diagnosis error')}catch(e:any){Alert.alert('RepairPilot',e.message)}
 });
 const answer=async(a:string)=>{
   if(!last?.next_step||busy)return;
   const h=[...history,{question:last.next_step.question,answer:a,risk:last.risk.level}];
   const previous=answerInput;setHistory(h);
   await next(h);
   setAnswerInput('');Keyboard.dismiss();
 };
 const submitTypedAnswer=()=>{const a=answerInput.trim();if(a)answer(a)};
 const resumePaused=()=>{if(last?.status!=='paused')return;setLast({...last,status:'ask'});setTimeout(()=>diagnosisScroll.current?.scrollToEnd({animated:true}),100)};
 const evidenceLabel=(source:string)=>({user_measurement:'Your result',visual:'Observation',general:'Diagnostic context',manual:'Manual reference'} as any)[source]||'Evidence';
 const needsContextPhoto=()=>{const q=(last?.next_step?.question||'').toLowerCase();return /photo|label|spark plug|nameplate|identification|serial/.test(q)};
 const GearBackdrop=()=> <View pointerEvents="none" style={s.gearLayer}><View style={s.steelTop}/><View style={s.hazardRail}/><View style={[s.amberGlow,{width:300,height:300,top:-120,right:-100}]}/><View style={[s.amberGlow,{width:240,height:240,top:430,left:-150,opacity:.35}]}/><Text style={[s.gear,{top:-10,right:-36,fontSize:154}]}>⚙</Text><Text style={[s.gear,{top:250,left:-58,fontSize:176}]}>⚙</Text><Text style={[s.gear,{top:610,right:-62,fontSize:194}]}>⚙</Text><View style={[s.bolt,{top:22,left:18}]}/><View style={[s.bolt,{top:22,right:18}]}/><View style={s.meshLine}/></View>;

 const completeRepair=async(outcome:'fixed'|'needs_work')=>runBusy('repair',async()=>{
   if(outcome==='fixed'&&!fix.trim())return Alert.alert('RepairPilot','Enter what fixed the problem before marking the repair fixed.');
   try{
    const savedSessionId=last?.session_id||'';
    const payload={session_id:savedSessionId||null,outcome,equipment_id:selected.id,equipment_name:selected.name,symptom,history,fix:fix.trim()||(outcome==='fixed'?'Fixed':'Unresolved'),part:part.trim(),notes:notes.trim()};
    const r=await signedFetch('/repairs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();
    if(!r.ok)throw new Error(j.detail||'Could not save repair');
    await sendFeedback(savedSessionId,outcome==='fixed',outcome==='fixed'?5:2);
    await clearDraft();setFix('');setPart('');setNotes('');setLast(null);setHistory([]);setVisual(null);setAnswerInput('');setScreen('home');
    Alert.alert('RepairPilot',outcome==='fixed'?'Confirmed fix saved to repair history.':'Repair saved as still needing work.');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });

 const sendFeedback=async(sessionId:string,success:boolean,rating:number)=>{
   if(!sessionId)return;
   try{await signedFetch('/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,rating,success,comment:''})})}catch{}
 };
 const loadHistory=async()=>{try{const r=await signedFetch('/repairs');if(!r.ok)throw new Error('Could not load repair history');setRepairs(await r.json());setScreen('history')}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const loadReviews=async()=>{try{const r=await signedFetch('/reviews');if(!r.ok)throw new Error('Could not load review queue');setReviews(await r.json());setScreen('reviews')}catch(e:any){Alert.alert('RepairPilot',e.message)}};

 const shareAccountExport=async()=>{
   try{
    const r=await signedFetch('/account/export');const data=await r.json();if(!r.ok)throw new Error(data.detail||'Export failed');
    const file=new File(Paths.cache,'RepairPilot_Account_Export.json');if(file.exists)file.delete();file.create();file.write(JSON.stringify(data,null,2));
    if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:'Share RepairPilot data export'});
    setAccountExport('ready');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };
 const shareReport=async(repair:any)=>{
   try{
    const r=await signedFetch(`/repairs/${repair.id}/report.pdf`);if(!r.ok)throw new Error('Report download failed');
    const bytes=new Uint8Array(await r.arrayBuffer());
    const file=new File(Paths.cache,`RepairPilot_${repair.id}.pdf`);
    if(file.exists)file.delete();
    file.create();file.write(bytes);
    if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Share RepairPilot report'});
    else Alert.alert('RepairPilot','Sharing is not available on this device.');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };

 if(screen==='onboarding')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <View style={s.brandPlate}><Text style={s.brand}>REPAIR<Text style={s.green}>PILOT</Text></Text><Text style={s.tagline}>DIAGNOSE IT. TEST IT. FIX IT.</Text></View><Text style={s.title}>Diagnose it. Test it. Fix it.</Text>
  <View style={s.card}><Text style={s.tileTitle}>1. Add the machine</Text><Text style={s.muted}>Save the manufacturer, model, serial, photos and manuals so RepairPilot can keep the repair tied to the right equipment.</Text></View>
  <View style={s.card}><Text style={s.tileTitle}>2. Test one thing at a time</Text><Text style={s.muted}>RepairPilot asks for observations and measurements, then uses the result to choose the next useful test.</Text></View>
  <View style={s.card}><Text style={s.tileTitle}>3. Respect the risk level</Text><Text style={s.muted}>Green is low-risk inspection. Yellow requires extra care and correct test procedures. Red means stop and escalate rather than bypassing safety systems or working on uncontrolled energy.</Text></View>
  <TouchableOpacity style={s.primary} onPress={async()=>{await AsyncStorage.setItem(ONBOARD_KEY,'1');setOnboarded(true);setScreen('auth')}}><Text style={s.primaryText}>I understand — continue</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='reset')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <View style={s.brandPlate}><Text style={s.brand}>REPAIR<Text style={s.green}>PILOT</Text></Text><Text style={s.tagline}>DIAGNOSE IT. TEST IT. FIX IT.</Text></View><Text style={s.title}>Reset password</Text>
  <TextInput style={s.input} placeholder="New password (8+ characters)" secureTextEntry placeholderTextColor="#70858b" value={newPassword} onChangeText={setNewPassword}/>
  <TouchableOpacity style={s.primary} onPress={confirmReset}><Text style={s.primaryText}>Change password</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('auth')}><Text style={s.white}>Cancel</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='loading')return <SafeAreaView style={s.safe}><GearBackdrop/><ActivityIndicator style={{marginTop:80}} size="large"/></SafeAreaView>;

 if(!token || screen==='auth')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <View style={s.brandPlate}><Text style={s.brand}>REPAIR<Text style={s.green}>PILOT</Text></Text><Text style={s.tagline}>DIAGNOSE IT. TEST IT. FIX IT.</Text></View><Text style={s.title}>Private Beta</Text>
  <View style={s.card}><Text style={s.tileTitle}>Before you start</Text><Text style={s.muted}>RepairPilot is a diagnostic assistant, not a substitute for qualified service on hazardous equipment. Stop when the app marks a step Red. Equipment profiles, uploaded manuals, photos and repair history are stored with your account.</Text></View>
  <TextInput style={s.input} placeholder="Email" placeholderTextColor="#70858b" autoCapitalize="none" value={email} onChangeText={setEmail}/>
  <TextInput style={s.input} placeholder="Password (8+ characters)" secureTextEntry placeholderTextColor="#70858b" value={password} onChangeText={setPassword}/>
  <TextInput style={s.input} placeholder="Beta invite code (registration only)" placeholderTextColor="#70858b" autoCapitalize="characters" value={invite} onChangeText={setInvite}/>
  <TouchableOpacity style={s.primary} onPress={()=>auth(false)}><Text style={s.primaryText}>Login</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>auth(true)}><Text style={s.white}>Create beta account</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={requestReset}><Text style={s.white}>Forgot password</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='home')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <View style={s.brandPlate}><Text style={s.brand}>REPAIR<Text style={s.green}>PILOT</Text></Text><Text style={s.tagline}>DIAGNOSE IT. TEST IT. FIX IT.</Text></View>
  <View style={s.grid}>
   <TouchableOpacity style={s.tile} onPress={async()=>{await loadEquipment();setScreen('equipment')}}><Text style={s.tileTitle}>My Equipment</Text><Text style={s.muted}>Profiles, photos & manuals</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={resumeDraft}><Text style={s.tileTitle}>Resume</Text><Text style={s.muted}>Continue unfinished diagnosis</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={loadHistory}><Text style={s.tileTitle}>Repair History</Text><Text style={s.muted}>Saved fixes & reports</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={loadReviews}><Text style={s.tileTitle}>Review Queue</Text><Text style={s.muted}>Escalated cases</Text></TouchableOpacity>
   <TouchableOpacity style={s.tile} onPress={()=>setScreen('settings')}><Text style={s.tileTitle}>Account</Text><Text style={s.muted}>Privacy & data controls</Text></TouchableOpacity>
  </View>
  <TouchableOpacity style={s.secondary} onPress={logout}><Text style={s.white}>Log out</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='settings')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Account & Privacy</Text>
  <View style={s.card}><Text style={s.tileTitle}>Your RepairPilot data</Text><Text style={s.muted}>You can export your account records or permanently delete your RepairPilot account. Uploaded equipment information is tied to your account.</Text></View>
  <TouchableOpacity style={s.secondary} onPress={shareAccountExport}><Text style={s.white}>Export / share my data</Text></TouchableOpacity>
  {accountExport?<View style={s.evidence}><Text style={s.muted}>Account export created and handed to the device share sheet.</Text></View>:null}
  <TouchableOpacity style={s.secondary} onPress={()=>Alert.alert('Delete account','This permanently deletes your RepairPilot account and associated beta records.',[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:async()=>{const r=await signedFetch('/account',{method:'DELETE'});if(r.ok){await SecureStore.deleteItemAsync(TOKEN_KEY);await AsyncStorage.removeItem(DRAFT_KEY);setToken('');setScreen('auth')}else Alert.alert('RepairPilot','Account deletion failed')}}
  ])}><Text style={s.white}>Delete my account</Text></TouchableOpacity>
  <View style={s.card}><Text style={s.tileTitle}>Safety</Text><Text style={s.muted}>RepairPilot is an assistant. Follow manufacturer procedures and workplace lockout/tagout rules. Do not bypass guards, interlocks, emergency stops, or other safety devices. Red steps require escalation.</Text></View>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='equipment')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>My Equipment</Text>
  <TextInput style={s.input} placeholder="Equipment name" placeholderTextColor="#70858b" value={newName} onChangeText={setNewName}/>
  <TextInput style={s.input} placeholder="Manufacturer (recommended)" placeholderTextColor="#70858b" value={newManufacturer} onChangeText={setNewManufacturer}/>
  <TextInput style={s.input} placeholder="Model (recommended)" placeholderTextColor="#70858b" value={newModel} onChangeText={setNewModel}/>
  <TextInput style={s.input} placeholder="Serial number (optional)" placeholderTextColor="#70858b" value={newSerial} onChangeText={setNewSerial}/>
  <TextInput style={s.input} placeholder="Category" placeholderTextColor="#70858b" value={newCat} onChangeText={setNewCat}/>
  <TouchableOpacity style={[s.primary,busy? s.disabled:null]} disabled={!!busy} onPress={addEquipment}><Text style={s.primaryText}>{busy==='equipment'?'Saving…':'Add equipment'}</Text></TouchableOpacity>
  {equipment.map(e=><TouchableOpacity key={e.id} style={s.card} onPress={()=>openEquipment(e)}><Text style={s.tileTitle}>{e.name}</Text><Text style={s.muted}>{[e.manufacturer,e.model].filter(Boolean).join(' ')||e.category}</Text><Text style={s.link}>Open repair workspace →</Text></TouchableOpacity>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='history')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Repair History</Text>
  {repairs.length===0?<Text style={s.muted}>No saved repairs yet.</Text>:repairs.map(r=><View key={r.id} style={s.card}><Text style={s.tileTitle}>{r.equipment_name}</Text><Text style={s.white}>{r.fix||'Unresolved'}</Text><Text style={s.muted}>{r.symptom}</Text><TouchableOpacity style={s.secondary} onPress={()=>shareReport(r)}><Text style={s.white}>Share PDF report</Text></TouchableOpacity></View>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='reviews')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Review Queue</Text>
  {reviews.length===0?<Text style={s.muted}>No escalated cases.</Text>:reviews.map(r=><View key={r.id} style={s.card}><Text style={s.tileTitle}>{r.risk_level.toUpperCase()} case</Text><Text style={s.muted}>{r.status}</Text></View>)}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('home')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 if(screen==='complete')return <SafeAreaView style={s.safe}><GearBackdrop/><ScrollView contentContainerStyle={s.wrap}>
  <Text style={s.title}>Repair Complete</Text>
  <TextInput style={s.input} placeholder="What fixed it?" placeholderTextColor="#70858b" value={fix} onChangeText={setFix}/>
  <TextInput style={s.input} placeholder="Part used (optional)" placeholderTextColor="#70858b" value={part} onChangeText={setPart}/>
  <TextInput style={[s.input,{minHeight:100}]} multiline placeholder="Notes" placeholderTextColor="#70858b" value={notes} onChangeText={setNotes}/>
  <TouchableOpacity style={s.primary} onPress={()=>completeRepair('fixed')}><Text style={s.primaryText}>Fixed — save confirmed repair</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>completeRepair('needs_work')}><Text style={s.white}>Save — still needs work</Text></TouchableOpacity>
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('diagnose')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><GearBackdrop/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={8}>
  <ScrollView ref={diagnosisScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.wrap}>
  <Text style={s.title}>{selected?.name}</Text>
  <View style={s.row}>
   <TouchableOpacity style={[s.secondaryHalf,busy? s.disabled:null]} disabled={!!busy} onPress={takePhoto}><Text style={s.white}>{busy==='photo'?'Analyzing…':'Take Photo'}</Text></TouchableOpacity>
   <TouchableOpacity style={[s.secondaryHalf,busy? s.disabled:null]} disabled={!!busy} onPress={choosePhoto}><Text style={s.white}>Choose Photo</Text></TouchableOpacity>
  </View>
  <TouchableOpacity style={[s.secondary,busy? s.disabled:null]} disabled={!!busy} onPress={uploadManual}><Text style={s.white}>{busy==='manual'?'Uploading…':'Add Manual PDF'}</Text></TouchableOpacity>
  {visual&&<View style={s.evidence}><Text style={s.white}>{visual.description}</Text><Text style={s.muted}>Vision confidence: {Math.round((visual.confidence||0)*100)}%</Text></View>}
  {!last?<>
   <TextInput style={[s.input,{minHeight:110}]} multiline placeholder="Describe exactly what the machine is doing" placeholderTextColor="#6f8a96" value={symptom} onChangeText={setSymptom}/>
   <TouchableOpacity style={[s.primary,busy? s.disabled:null]} disabled={!!busy} onPress={()=>next()}><Text style={s.primaryText}>Start diagnosis</Text></TouchableOpacity>
  </>:<>
   <View style={s.card}><View style={s.cardHeader}><Text style={s.tileTitle}>⚙ RepairPilot</Text><View style={[s.riskPill,last.risk?.level==='green'?s.riskGreen:last.risk?.level==='yellow'?s.riskYellow:s.riskRed]}><Text style={s.riskText}>Risk: {last.risk?.level?.toUpperCase()}</Text></View></View><Text style={s.white}>{last.next_step?.question||last.notes_for_record}</Text></View>
   {last.evidence?.map((e:any,i:number)=><View key={i} style={s.evidence}><Text style={s.evidenceTitle}>{evidenceLabel(e.source)}{e.citation?` — ${e.citation}`:''}</Text><Text style={s.muted}>{e.detail||''}</Text></View>)}
   {needsContextPhoto()&&last.status==='ask'?<View style={s.row}><TouchableOpacity style={s.contextAction} disabled={!!busy} onPress={takePhoto}><Text style={s.contextText}>📷 Take requested photo</Text></TouchableOpacity><TouchableOpacity style={s.contextAction} disabled={!!busy} onPress={choosePhoto}><Text style={s.contextText}>Choose photo</Text></TouchableOpacity></View>:null}
   {last.status==='paused'?<View style={s.pauseBox}><Text style={s.pauseTitle}>Diagnosis paused</Text><Text style={s.white}>{last.notes_for_record}</Text><TouchableOpacity style={s.secondary} onPress={resumePaused}><Text style={s.white}>I'm back at the equipment — resume here</Text></TouchableOpacity></View>:null}
   {last.status==='ask'&&last.risk?.level!=='red'&&last.next_step?.choices?.map((c:string)=><TouchableOpacity key={c} disabled={!!busy} style={[s.secondary,busy? s.disabled:null]} onPress={()=>answer(c)}><Text style={s.white}>{c}</Text></TouchableOpacity>)}
   {last.status==='ask'&&last.risk?.level!=='red'&&last.next_step && last.next_step.choices?.length===0 ? <>
    <TextInput style={s.input} placeholder={last.next_step.answer_type==='measurement'?`Enter measurement${last.next_step.unit?` (${last.next_step.unit})`:''}`:'Enter your answer'} placeholderTextColor="#6f8a96" value={answerInput} onChangeText={setAnswerInput} keyboardType={last.next_step.answer_type==='measurement'?'decimal-pad':'default'} returnKeyType="done" blurOnSubmit={true} onFocus={()=>setTimeout(()=>diagnosisScroll.current?.scrollToEnd({animated:true}),250)} onSubmitEditing={()=>Keyboard.dismiss()}/>
    <TouchableOpacity style={[s.secondary,busy? s.disabled:null]} disabled={!!busy} onPress={submitTypedAnswer}><Text style={s.white}>{`Submit answer${last.next_step.unit?` (${last.next_step.unit})`:''}`}</Text></TouchableOpacity>
   </>:null}
   {last.status==='escalate'||last.risk?.level==='red'?<View style={s.stopBox}><Text style={s.stopTitle}>STOP / ESCALATE</Text><Text style={s.white}>{last.risk?.reason||'This step requires a qualified technician.'}</Text></View>:null}
   {busy==='diagnose'?<View style={s.thinking}><ActivityIndicator size="small"/><View style={{flex:1}}><Text style={s.thinkingTitle}>RepairPilot is analyzing your results…</Text><Text style={s.muted}>Your previous diagnostic information will stay here while the next step is prepared.</Text></View></View>:null}
   <TouchableOpacity style={s.outcomeButton} onPress={()=>setScreen('complete')}><Text style={s.outcomeText}>{last.status==='complete'?'Repair complete — save outcome':'End diagnosis / save outcome'}</Text></TouchableOpacity>
  </>}
  <TouchableOpacity style={s.secondary} onPress={()=>setScreen('equipment')}><Text style={s.white}>Back</Text></TouchableOpacity>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#090b0d'},wrap:{padding:20,paddingBottom:64},brand:{fontSize:38,fontWeight:'900',fontStyle:'italic',letterSpacing:-1,color:'#f4f4f0',textShadowColor:'rgba(0,0,0,.9)',textShadowRadius:6},green:{color:'#ffb300'},tagline:{color:'#d0d2d3',fontSize:11,fontWeight:'900',letterSpacing:2,marginTop:4},brandPlate:{borderBottomColor:'#ffb300',borderBottomWidth:2,paddingBottom:12,marginBottom:24},
 gearLayer:{...StyleSheet.absoluteFillObject,overflow:'hidden',backgroundColor:'#090b0d'},gear:{position:'absolute',color:'rgba(123,128,130,.13)',fontWeight:'400',textShadowColor:'rgba(255,179,0,.12)',textShadowRadius:16},amberGlow:{position:'absolute',borderRadius:999,backgroundColor:'rgba(255,153,0,.10)'},steelTop:{position:'absolute',left:0,right:0,top:0,height:110,backgroundColor:'rgba(35,38,40,.72)',borderBottomColor:'rgba(255,179,0,.28)',borderBottomWidth:1},hazardRail:{position:'absolute',left:0,right:0,bottom:0,height:8,backgroundColor:'#c88700',opacity:.55},bolt:{position:'absolute',width:8,height:8,borderRadius:4,backgroundColor:'#73787a',borderWidth:1,borderColor:'#151719'},meshLine:{position:'absolute',left:20,right:20,top:92,height:1,backgroundColor:'rgba(255,179,0,.18)'},
 title:{fontSize:28,fontWeight:'900',color:'#f4f4f0',marginBottom:15,textShadowColor:'rgba(0,0,0,.8)',textShadowRadius:5},muted:{color:'#aeb2b4',lineHeight:20},white:{color:'#f6fbff',fontSize:16},link:{color:'#ffc027',marginTop:8,fontWeight:'700'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:11},tile:{width:'48%',backgroundColor:'rgba(27,29,30,.96)',borderColor:'rgba(255,179,0,.55)',borderWidth:1,borderRadius:18,padding:17,minHeight:112,shadowColor:'#ffb300',shadowOpacity:.14,shadowRadius:12,shadowOffset:{width:0,height:5}},
 tileTitle:{color:'#f7fcff',fontWeight:'900',fontSize:18,marginBottom:5},card:{backgroundColor:'rgba(25,27,28,.97)',borderColor:'rgba(255,179,0,.58)',borderWidth:1,borderRadius:19,padding:17,marginTop:13,shadowColor:'#ffb300',shadowOpacity:.12,shadowRadius:14,shadowOffset:{width:0,height:5}},
 evidence:{backgroundColor:'rgba(20,22,23,.97)',borderColor:'rgba(117,122,124,.7)',borderWidth:1,borderRadius:13,padding:12,marginTop:10},
 input:{backgroundColor:'rgba(18,20,21,.98)',borderColor:'rgba(104,109,111,.8)',borderWidth:1,borderRadius:14,padding:14,color:'#fff',fontSize:16,marginBottom:10},
 primary:{backgroundColor:'#ffb300',borderColor:'#ffd05a',borderWidth:1,borderRadius:14,padding:15,marginTop:8,shadowColor:'#ffb300',shadowOpacity:.22,shadowRadius:10,shadowOffset:{width:0,height:4}},primaryText:{textAlign:'center',fontWeight:'900',color:'#15110a'},
 secondary:{backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(112,117,119,.78)',borderWidth:1,borderRadius:14,padding:14,marginTop:8},
 row:{flexDirection:'row',gap:10,marginBottom:10},secondaryHalf:{flex:1,backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(112,117,119,.78)',borderWidth:1,borderRadius:14,padding:14},
 cardHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8},riskPill:{borderRadius:999,paddingHorizontal:10,paddingVertical:5},riskGreen:{backgroundColor:'#0a6d2c'},riskYellow:{backgroundColor:'#80680b'},riskRed:{backgroundColor:'#812929'},riskText:{color:'#fff',fontWeight:'900',fontSize:12},evidenceTitle:{color:'#ffc027',fontWeight:'900',fontSize:14,marginBottom:4},contextAction:{flex:1,backgroundColor:'rgba(42,37,25,.98)',borderColor:'#ffb300',borderWidth:1,borderRadius:14,padding:12,marginTop:10},contextText:{color:'#ffe2a0',fontWeight:'900',textAlign:'center'},thinking:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:'rgba(42,37,25,.98)',borderColor:'#ffb300',borderWidth:1,borderRadius:15,padding:14,marginTop:12},thinkingTitle:{color:'#fff',fontWeight:'900',marginBottom:3},pauseBox:{backgroundColor:'rgba(44,39,26,.98)',borderColor:'#ffc027',borderWidth:1,borderRadius:15,padding:14,marginTop:12},pauseTitle:{color:'#ffd46b',fontWeight:'900',fontSize:17,marginBottom:6},outcomeButton:{backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(255,179,0,.55)',borderWidth:1,borderRadius:14,padding:14,marginTop:12},outcomeText:{color:'#f4f4f0',textAlign:'center',fontWeight:'900'},disabled:{opacity:.55},stopBox:{backgroundColor:'rgba(79,27,27,.97)',borderColor:'#ff8585',borderWidth:1,borderRadius:15,padding:14,marginTop:12},stopTitle:{color:'#ffd0d0',fontWeight:'900',fontSize:16,marginBottom:6}
});
