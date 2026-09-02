import React,{useEffect,useRef,useState} from 'react';
import {SafeAreaView,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View,Alert,ActivityIndicator,KeyboardAvoidingView,Platform,Keyboard,ImageBackground,Image} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import {File,Paths} from 'expo-file-system';
import * as Linking from 'expo-linking';
import {MaterialCommunityIcons} from '@expo/vector-icons';

const API=process.env.EXPO_PUBLIC_API_URL || 'https://repairpilot-api.onrender.com';
const TOKEN_KEY='repairpilot.auth.token';
const DRAFT_KEY='repairpilot.diagnosis.draft';
const ONBOARD_KEY='repairpilot.onboarding.seen';
const COMING_SOON='This feature is being built for the next RepairPilot beta.';
const PREVIEW_MODE=process.env.EXPO_PUBLIC_PREVIEW_MODE==='true';
const PREVIEW_START=(process.env.EXPO_PUBLIC_PREVIEW_SCREEN||'home').toLowerCase();
const PREVIEW_EQUIPMENT=[
 {id:'preview-mower',name:'Husqvarna Riding Mower',manufacturer:'Husqvarna',model:'YTH26V54',serial:'PREVIEW-001',category:'Small engines',notes:'Visual preview data only'},
 {id:'preview-excavator',name:'CAT 320 Excavator',manufacturer:'Caterpillar',model:'320',serial:'PREVIEW-002',category:'Heavy equipment',notes:'Visual preview data only'},
 {id:'preview-truck',name:'Ford F-250',manufacturer:'Ford',model:'F-250 6.7L',serial:'PREVIEW-003',category:'Automotive',notes:'Visual preview data only'}
];
const PREVIEW_REPAIRS=[
 {id:'preview-repair-1',equipment_name:'CAT 320 Excavator',fix:'Hydraulic System',symptom:'Completed',date:'May 20, 2025',status:'COMPLETED'},
 {id:'preview-repair-2',equipment_name:'John Deere 544K',fix:'Electrical System',symptom:'In progress',date:'May 19, 2025',status:'IN PROGRESS'},
 {id:'preview-repair-3',equipment_name:'Ford F-250 6.7L',fix:'Engine Performance',symptom:'Completed',date:'May 18, 2025',status:'COMPLETED'}
];

type Screen='loading'|'onboarding'|'auth'|'reset'|'home'|'equipment'|'diagnose'|'history'|'reviews'|'complete'|'settings'|'scanner'|'ar'|'maintenance';

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
 const [showAddEquipment,setShowAddEquipment]=useState(false),[equipmentSearch,setEquipmentSearch]=useState('');
 const [selected,setSelected]=useState<any>(null);
 const [symptom,setSymptom]=useState(''),[history,setHistory]=useState<any[]>([]),[last,setLast]=useState<any>(null),[visual,setVisual]=useState<any>(null);
 const [answerInput,setAnswerInput]=useState('');
 const [repairs,setRepairs]=useState<any[]>([]),[reviews,setReviews]=useState<any[]>([]);
 const [fix,setFix]=useState(''),[part,setPart]=useState(''),[notes,setNotes]=useState('');
 const [scannerImage,setScannerImage]=useState(''),[scannerType,setScannerType]=useState('FASTENER');
 const [previewPickerVisible,setPreviewPickerVisible]=useState(false);
 const diagnosisScroll=useRef<ScrollView>(null);
 const previewMode=PREVIEW_MODE;

 const authHeaders=()=>({Authorization:`Bearer ${token}`});
 const jsonHeaders=()=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});
 const previewNotice=()=>Alert.alert('Visual Preview','This control is disabled in preview mode. No account or backend data will be changed.');

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
 useEffect(()=>{if(!previewMode&&screen==='diagnose'&&selected)saveDraft()},[selected,symptom,history,last,visual,screen]);

 const handleUrl=(url:string)=>{const m=url.match(/[?&]token=([^&]+)/);if(m){setResetToken(decodeURIComponent(m[1]));setScreen('reset')}};
 const rehydrate=async()=>{
   if(previewMode){
     const allowed:Screen[]=['home','equipment','diagnose','history','settings','scanner','ar','maintenance'];
     setToken('__visual_preview__');setEquipment(PREVIEW_EQUIPMENT);setSelected(PREVIEW_EQUIPMENT[0]);setRepairs(PREVIEW_REPAIRS);
     setScreen(allowed.includes(PREVIEW_START as Screen)?PREVIEW_START as Screen:'home');return;
   }
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
 const logout=async()=>{if(previewMode){setScreen('home');return}await SecureStore.deleteItemAsync(TOKEN_KEY);setToken('');setScreen('auth')};

 const saveDraft=async()=>{
   try{await AsyncStorage.setItem(DRAFT_KEY,JSON.stringify({selected,symptom,history,last,visual,savedAt:Date.now()}))}catch{}
 };
 const resumeDraft=async()=>{
   if(previewMode){setSelected(PREVIEW_EQUIPMENT[0]);setSymptom('Loss of power');setLast(null);setScreen('diagnose');return}
   try{
    const raw=await AsyncStorage.getItem(DRAFT_KEY);if(!raw)return Alert.alert('RepairPilot','No unfinished diagnosis saved.');
    const d=JSON.parse(raw);setSelected(d.selected);setSymptom(d.symptom||'');setHistory(d.history||[]);setLast(d.last||null);setVisual(d.visual||null);setScreen('diagnose');
   }catch{Alert.alert('RepairPilot','Could not restore the saved diagnosis.')}
 };
 const clearDraft=async()=>{await AsyncStorage.removeItem(DRAFT_KEY)};

 const loadEquipment=async()=>{if(previewMode){setEquipment(PREVIEW_EQUIPMENT);return}try{const r=await signedFetch('/equipment');if(!r.ok)throw new Error('Could not load equipment');setEquipment(await r.json())}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const addEquipment=async()=>runBusy('equipment',async()=>{
   if(previewMode){previewNotice();return}
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
   if(previewMode){previewNotice();return}
   try{
    const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted){Alert.alert('RepairPilot','Camera permission is required to take an equipment photo.');return}
    const result=await ImagePicker.launchCameraAsync({quality:.7,mediaTypes:['images']});if(result.canceled)return;
    await analyzePhotoAsset(result.assets[0]);
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });
 const choosePhoto=async()=>runBusy('photo',async()=>{
   if(previewMode){previewNotice();return}
   try{
    const result=await ImagePicker.launchImageLibraryAsync({quality:.7,mediaTypes:['images'],allowsMultipleSelection:false});if(result.canceled)return;
    await analyzePhotoAsset(result.assets[0]);
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 });

 const uploadManual=async()=>runBusy('manual',async()=>{
   if(previewMode){previewNotice();return}
   const result=await DocumentPicker.getDocumentAsync({type:'application/pdf',copyToCacheDirectory:true});if(result.canceled)return;
   const asset=result.assets[0],fd=new FormData();fd.append('equipment_id',selected.id);
   fd.append('file',{uri:asset.uri,name:asset.name,type:asset.mimeType||'application/pdf'} as any);
   try{const r=await signedFetch('/manuals/upload',{method:'POST',body:fd});const j=await r.json();
   Alert.alert('RepairPilot',r.ok?`Indexed ${j.pages_parsed} pages from ${j.name}`:(j.detail||'Upload failed'))}catch(e:any){Alert.alert('RepairPilot',e.message)}
 });

 const next=async(h=history)=>runBusy('diagnose',async()=>{
   if(!selected?.id)return Alert.alert('RepairPilot','Choose an equipment profile first.');
   if(!symptom.trim())return Alert.alert('RepairPilot','Describe the symptom before starting diagnosis.');
   if(previewMode){setLast({session_id:'preview-session',status:'ask',risk:{level:'green',reason:'Visual preview only'},next_step:{question:'With the engine off, inspect the drive belt. Is it loose, damaged, or off a pulley?',answer_type:'choice',choices:['Belt looks normal','Belt is loose','Belt is damaged or off']},evidence:[{source:'general',detail:'Preview diagnostic content — nothing will be saved.'}]});return}
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
 const nav=(to:Screen)=>setScreen(to);
 const symptomSelected=(item:string)=>symptom.split(';').map(x=>x.trim()).includes(item);
 const toggleSymptom=(item:string)=>{
   const items=symptom.split(';').map(x=>x.trim()).filter(Boolean);
   setSymptom(items.includes(item)?items.filter(x=>x!==item).join('; '):[...items,item].join('; '));
 };
 const machineIcon=(e:any)=>{
   const text=`${e?.category||''} ${e?.name||''}`.toLowerCase();
   if(text.includes('mower')||text.includes('small engine'))return 'lawn-mower';
   if(text.includes('excavator')||text.includes('heavy'))return 'excavator';
   if(text.includes('truck')||text.includes('ford')||text.includes('automotive'))return 'car-pickup';
   return 'engine-outline';
 };
 const openPreview=(to:Screen)=>{setPreviewPickerVisible(false);if(to==='equipment')setEquipment(PREVIEW_EQUIPMENT);if(to==='diagnose'){setSelected(PREVIEW_EQUIPMENT[0]);setLast(null);setSymptom('')}if(to==='history')setRepairs(PREVIEW_REPAIRS);setScreen(to)};
 const comingSoon=(name:string)=>Alert.alert(name,COMING_SOON);
 const captureHardware=async()=>{if(previewMode){previewNotice();return}try{const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted)return Alert.alert('RepairPilot','Camera permission is required for Hardware Scanner.');const result=await ImagePicker.launchCameraAsync({quality:.9,mediaTypes:['images']});if(!result.canceled)setScannerImage(result.assets[0].uri)}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const TopBar=({title,back}:{title?:string,back?:Screen})=><>{<View style={s.topBar}>{back?<TouchableOpacity style={s.topHit} onPress={()=>nav(back)}><MaterialCommunityIcons name="chevron-left" size={28} color="#f2f2ed"/></TouchableOpacity>:<TouchableOpacity style={s.topHit} onPress={()=>previewMode&&setPreviewPickerVisible(!previewPickerVisible)}><MaterialCommunityIcons name="menu" size={25} color="#f2f2ed"/></TouchableOpacity>}<View style={s.wordmarkRow}>{!title?<Image source={require('../assets/repairpilot-icon.png')} style={s.wordmarkIcon}/>:null}<Text style={s.topBrand}>{title||<>REPAIR<Text style={s.green}>PILOT</Text></>}</Text></View><TouchableOpacity style={s.topHit} onPress={()=>previewMode?setPreviewPickerVisible(!previewPickerVisible):nav('settings')}><MaterialCommunityIcons name={previewMode?'monitor-eye':'bell-outline'} size={22} color={previewMode?'#ffb000':'#f2f2ed'}/></TouchableOpacity></View>}{previewMode?<View style={s.previewBar}><View style={s.previewBarTitle}><MaterialCommunityIcons name="eye-outline" size={14} color="#15110a"/><Text style={s.previewBarText}>VISUAL PREVIEW • DATA IS NOT SAVED</Text></View>{previewPickerVisible?<View style={s.previewPicker}>{([['home','Home'],['equipment','Equipment'],['diagnose','AI Diagnosis'],['history','Diagnostics'],['scanner','Scanner'],['ar','AR Assistant'],['maintenance','Maintenance'],['settings','Account & Privacy']] as [Screen,string][]).map(([key,label])=><TouchableOpacity key={key} style={[s.previewChoice,screen===key&&s.previewChoiceActive]} onPress={()=>openPreview(key)}><Text style={[s.previewChoiceText,screen===key&&s.previewChoiceTextActive]}>{label}</Text></TouchableOpacity>)}</View>:null}</View>:null}</>;
 const BottomNav=({active}:{active:string})=><View style={s.bottomNav}>{([['home','home','Home'],['equipment','tractor','Equipment'],['history','shield-wrench-outline','Diagnosis'],['scanner','line-scan','Scanner'],['ar','cube-scan','AR Assist'],['settings','account-outline','Profile']] as const).map(([key,icon,label])=><TouchableOpacity key={key} style={s.navItem} onPress={()=>key==='scanner'?nav('scanner'):key==='equipment'?(loadEquipment(),nav('equipment')):key==='history'?loadHistory():nav(key as Screen)}><MaterialCommunityIcons name={icon as any} size={18} color={active===key?'#ffb000':'#858b8d'}/><Text style={[s.navLabel,active===key&&s.navActive]}>{label}</Text></TouchableOpacity>)}</View>;
 const SectionHeader=({children}:{children:any})=><View style={s.sectionHeader}><Text style={s.sectionTitle}>{children}</Text><View style={s.sectionRail}/></View>;
 const FeatureTile=({icon,title,sub,onPress,badge}:{icon:any,title:string,sub:string,onPress:()=>void,badge?:string})=><TouchableOpacity style={s.featureTile} onPress={onPress}><View style={s.featureIconBox}><MaterialCommunityIcons name={icon} size={39} color="#ffb000"/></View>{badge?<Text style={s.newBadge}>{badge}</Text>:null}<Text style={s.featureTitle}>{title}</Text><Text style={s.featureSub}>{sub}</Text></TouchableOpacity>;
 const GearBackdrop=()=> <ImageBackground source={require('../assets/industrial-bg-v34.png')} resizeMode="cover" style={s.gearLayer} imageStyle={s.bgImage}><View style={s.bgShade}/><Image source={require('../assets/distressed-surface-v35.png')} resizeMode="cover" style={s.distressTexture}/><View style={s.steelTop}/><View style={s.hazardRail}/><View style={[s.bolt,{top:22,left:18}]}/><View style={[s.bolt,{top:22,right:18}]}/></ImageBackground>;

 const completeRepair=async(outcome:'fixed'|'needs_work')=>runBusy('repair',async()=>{
   if(previewMode){previewNotice();return}
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
 const loadHistory=async()=>{if(previewMode){setRepairs(PREVIEW_REPAIRS);setScreen('history');return}try{const r=await signedFetch('/repairs');if(!r.ok)throw new Error('Could not load repair history');setRepairs(await r.json());setScreen('history')}catch(e:any){Alert.alert('RepairPilot',e.message)}};
 const loadReviews=async()=>{if(previewMode){previewNotice();return}try{const r=await signedFetch('/reviews');if(!r.ok)throw new Error('Could not load review queue');setReviews(await r.json());setScreen('reviews')}catch(e:any){Alert.alert('RepairPilot',e.message)}};

 const shareAccountExport=async()=>{
   if(previewMode){previewNotice();return}
   try{
    const r=await signedFetch('/account/export');const data=await r.json();if(!r.ok)throw new Error(data.detail||'Export failed');
    const file=new File(Paths.cache,'RepairPilot_Account_Export.json');if(file.exists)file.delete();file.create();file.write(JSON.stringify(data,null,2));
    if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:'Share RepairPilot data export'});
    setAccountExport('ready');
   }catch(e:any){Alert.alert('RepairPilot',e.message)}
 };
 const shareReport=async(repair:any)=>{
   if(previewMode){previewNotice();return}
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

 if(!token || screen==='auth')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><ScrollView contentContainerStyle={s.authWrap}>
  <Image source={require('../assets/repairpilot-icon.png')} style={s.loginLogo}/><Text style={s.loginBrand}>REPAIR<Text style={s.green}>PILOT</Text></Text><Text style={s.loginTag}>DIAGNOSE. REPAIR. DONE RIGHT.</Text>
  <Text style={s.fieldLabel}>EMAIL</Text><TextInput style={s.loginInput} placeholder="Enter your email" placeholderTextColor="#7c8286" autoCapitalize="none" value={email} onChangeText={setEmail}/>
  <Text style={s.fieldLabel}>PASSWORD</Text><TextInput style={s.loginInput} placeholder="Enter your password" secureTextEntry placeholderTextColor="#7c8286" value={password} onChangeText={setPassword}/>
  <TouchableOpacity onPress={requestReset}><Text style={s.forgot}>Forgot password?</Text></TouchableOpacity>
  <TouchableOpacity style={s.signIn} onPress={()=>auth(false)}><Text style={s.primaryText}>SIGN IN     ›</Text></TouchableOpacity>
  <View style={s.orRow}><View style={s.orLine}/><Text style={s.orText}>OR</Text><View style={s.orLine}/></View>
  <TextInput style={s.loginInput} placeholder="Beta invite code — registration only" placeholderTextColor="#7c8286" autoCapitalize="characters" value={invite} onChangeText={setInvite}/>
  <TouchableOpacity style={s.createAccount} onPress={()=>auth(true)}><Text style={s.createAccountText}>CREATE ACCOUNT</Text></TouchableOpacity><Text style={s.version}>RepairPilot v0.23 beta</Text>
 </ScrollView></SafeAreaView>;

 if(screen==='home')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.welcomeBlock}><Text style={s.welcomeSmall}>Welcome back,</Text><Text style={s.welcomeName}>BRYAN</Text><Text style={s.welcomeSub}>Ready to diagnose and repair.</Text></View>
  <SectionHeader>QUICK ACTIONS</SectionHeader><View style={s.featureGrid}>
   <FeatureTile icon="brain" title="AI DIAGNOSIS" sub="Start a new diagnostic" onPress={async()=>{await loadEquipment();nav('equipment')}}/>
   <FeatureTile icon="line-scan" title="HARDWARE SCANNER" sub="Identify parts" badge="NEW" onPress={()=>nav('scanner')}/>
   <FeatureTile icon="cube-scan" title="AR ASSISTANT" sub="Visual guidance" badge="NEW" onPress={()=>nav('ar')}/>
   <FeatureTile icon="tractor" title="MY EQUIPMENT" sub="Manage machines" onPress={async()=>{await loadEquipment();nav('equipment')}}/>
   <FeatureTile icon="clipboard-text-outline" title="DIAGNOSTICS" sub="Repairs & reports" onPress={loadHistory}/>
   <FeatureTile icon="calendar-wrench" title="MAINTENANCE" sub="Service reminders" onPress={()=>nav('maintenance')}/>
  </View>
  <View style={s.activityHeader}><Text style={s.sectionTitle}>RECENT ACTIVITY</Text><TouchableOpacity onPress={loadHistory}><Text style={s.viewAll}>VIEW ALL</Text></TouchableOpacity></View>
  <TouchableOpacity style={s.recentRow} onPress={()=>openEquipment(PREVIEW_EQUIPMENT[1])}><MaterialCommunityIcons name="excavator" size={28} color="#ffb000"/><View style={s.recentInfo}><Text style={s.recentTitle}>CAT 320 Excavator</Text><Text style={s.recentSub}>Hydraulic System</Text></View><View style={s.recentStatus}><Text style={s.completed}>COMPLETED</Text><Text style={s.recentDate}>May 20, 2025</Text></View></TouchableOpacity>
  <TouchableOpacity style={s.recentRow} onPress={resumeDraft}><MaterialCommunityIcons name="excavator" size={28} color="#ffb000"/><View style={s.recentInfo}><Text style={s.recentTitle}>John Deere 544K</Text><Text style={s.recentSub}>Electrical System</Text></View><View style={s.recentStatus}><Text style={s.inProgress}>IN PROGRESS</Text><Text style={s.recentDate}>May 19, 2025</Text></View></TouchableOpacity>
 </ScrollView><BottomNav active="home"/></SafeAreaView>;

 if(screen==='scanner')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar title="HARDWARE SCANNER" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.scanTabs}>{['FASTENER','FITTING','BEARING','OTHER'].map(t=><TouchableOpacity key={t} style={[s.scanTab,scannerType===t&&s.scanTabActive]} onPress={()=>setScannerType(t)}><Text style={[s.scanTabText,scannerType===t&&s.scanTabTextActive]}>{t}</Text></TouchableOpacity>)}</View>
  <View style={s.scannerFrame}>{scannerImage?<Image source={{uri:scannerImage}} style={s.scannerImage} resizeMode="cover"/>:<><View style={s.scanGrid}/><Text style={s.scanReady}>SCAN READY</Text><Text style={s.scanTarget}>⌗</Text></>}<View style={[s.corner,s.cTL]}/><View style={[s.corner,s.cTR]}/><View style={[s.corner,s.cBL]}/><View style={[s.corner,s.cBR]}/></View>
  <Text style={s.scanHelp}>{scannerImage?'Photo captured. Automatic diameter, length and thread-pitch measurement is not enabled yet.':'Center the hardware in the frame\nGood lighting improves accuracy'}</Text>
  <View style={s.scanControls}><TouchableOpacity style={s.scanSide} onPress={()=>Alert.alert('Scanner light','Flash control will be connected with the native scanner camera module.')}><MaterialCommunityIcons name="flashlight" size={22} color="#f3f3ef"/><Text style={s.scanSideText}>LIGHT</Text></TouchableOpacity><TouchableOpacity style={s.shutter} onPress={captureHardware}><View style={s.shutterInner}/></TouchableOpacity><TouchableOpacity style={s.scanSide} onPress={()=>Alert.alert('Manual measure','Manual measurement entry will be available alongside automatic scanning.')}><MaterialCommunityIcons name="ruler" size={22} color="#f3f3ef"/><Text style={s.scanSideText}>MANUAL\nMEASURE</Text></TouchableOpacity></View>
  {scannerImage?<TouchableOpacity style={s.primary} onPress={()=>setScannerImage('')}><Text style={s.primaryText}>RETAKE PHOTO</Text></TouchableOpacity>:null}
  <View style={s.devNotice}><Text style={s.evidenceTitle}>SCANNER ENGINE STATUS</Text><Text style={s.muted}>The production UI and camera capture are in place. LiDAR/depth calibration, thread-pitch measurement, confidence scoring and replacement matching remain engineering work and will not return fabricated identifications.</Text></View>
 </ScrollView><BottomNav active="scanner"/></SafeAreaView>;

 if(screen==='ar')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar title="AR REPAIR ASSISTANT" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.arCamera}><View style={s.arGrid}/><View style={s.arFocus}><MaterialCommunityIcons name="cube-scan" size={58} color="#ffb000"/><Text style={s.arReady}>AR READY</Text></View><View style={s.arStepCard}><Text style={s.arStepKicker}>HYDRAULIC PUMP • STEP 4 OF 12</Text><Text style={s.arStepText}>Aim at the component to anchor guided repair steps.</Text></View><View style={[s.corner,s.cTL]}/><View style={[s.corner,s.cTR]}/><View style={[s.corner,s.cBL]}/><View style={[s.corner,s.cBR]}/></View>
  <View style={s.arControls}><TouchableOpacity style={s.arControl}><MaterialCommunityIcons name="cube-outline" size={21} color="#f3f3ef"/><Text style={s.scanSideText}>PARTS</Text></TouchableOpacity><TouchableOpacity style={s.arPrimary} onPress={()=>previewMode?previewNotice():captureHardware()}><MaterialCommunityIcons name="camera-outline" size={25} color="#111"/><Text style={s.arPrimaryText}>START AR</Text></TouchableOpacity><TouchableOpacity style={s.arControl}><MaterialCommunityIcons name="notebook-outline" size={21} color="#f3f3ef"/><Text style={s.scanSideText}>NOTES</Text></TouchableOpacity></View>
  <View style={s.devNotice}><Text style={s.evidenceTitle}>AR ENGINE STATUS</Text><Text style={s.muted}>Camera guidance layout is ready. Real-world anchors and spatial overlays require the native iOS AR module and physical-device testing.</Text></View>
 </ScrollView><BottomNav active="ar"/></SafeAreaView>;

 if(screen==='maintenance')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar title="MAINTENANCE" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <SectionHeader>MAINTENANCE REMINDERS</SectionHeader><View style={s.emptyIndustrial}><MaterialCommunityIcons name="calendar-wrench" size={50} color="#ffb000"/><Text style={s.activityTitle}>No maintenance reminders yet</Text><Text style={s.featureSub}>Maintenance schedules will be tied to your real equipment profiles—no sample machines or fake due dates.</Text></View>
 </ScrollView><BottomNav active="home"/></SafeAreaView>;

 if(screen==='settings')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar title="ACCOUNT & PRIVACY" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.profileCard}><View style={s.profileIcon}><MaterialCommunityIcons name="account-outline" size={39} color="#ffb000"/></View><View style={{flex:1}}><Text style={s.profileTitle}>YOUR REPAIRPILOT DATA</Text><Text style={s.profileText}>Export your account records or permanently delete your RepairPilot account. Uploaded equipment information stays tied to your account.</Text></View></View>
  <View style={s.actionList}><TouchableOpacity style={s.actionRow} onPress={shareAccountExport}><Text style={s.actionIcon}>⇧</Text><Text style={s.actionText}>Export / share my data</Text><Text style={s.actionChevron}>›</Text></TouchableOpacity>
  <TouchableOpacity style={s.actionRow} onPress={()=>previewMode?previewNotice():Alert.alert('Delete account','This permanently deletes your RepairPilot account and associated beta records.',[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:async()=>{const r=await signedFetch('/account',{method:'DELETE'});if(r.ok){await SecureStore.deleteItemAsync(TOKEN_KEY);await AsyncStorage.removeItem(DRAFT_KEY);setToken('');setScreen('auth')}else Alert.alert('RepairPilot','Account deletion failed')}}
  ])}><Text style={s.actionIcon}>⌫</Text><Text style={s.actionText}>Delete my account</Text><Text style={s.actionChevron}>›</Text></TouchableOpacity></View>
  {accountExport?<View style={s.evidence}><Text style={s.muted}>Account export created and handed to the device share sheet.</Text></View>:null}
  <View style={s.safetyCard}><View style={s.safetyShield}><Text style={s.safetyShieldText}>✓</Text></View><View style={{flex:1}}><Text style={s.profileTitle}>SAFETY</Text><Text style={s.profileText}>Follow manufacturer procedures and workplace lockout/tagout rules. Do not bypass guards, interlocks, emergency stops, or other safety devices. <Text style={s.redText}>Red steps</Text> require escalation.</Text></View></View>
  <TouchableOpacity style={s.backCard} onPress={()=>setScreen('home')}><Text style={s.actionIcon}>←</Text><Text style={s.actionText}>Back</Text></TouchableOpacity>
 </ScrollView><BottomNav active="settings"/></SafeAreaView>;

 if(screen==='equipment')return <SafeAreaView style={s.safe}><GearBackdrop/><TopBar title="EQUIPMENT" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.searchRow}><TextInput style={s.searchInput} placeholder="Search equipment..." placeholderTextColor="#777" value={equipmentSearch} onChangeText={setEquipmentSearch}/><TouchableOpacity style={s.filterButton} onPress={()=>setShowAddEquipment(!showAddEquipment)}><Text style={s.filterText}>{showAddEquipment?'×':'＋'}</Text></TouchableOpacity></View>
  {showAddEquipment?<View style={s.addPanel}><Text style={s.sectionTitle}>ADD EQUIPMENT</Text><TextInput style={s.input} placeholder="Equipment name" placeholderTextColor="#70858b" value={newName} onChangeText={setNewName}/><TextInput style={s.input} placeholder="Manufacturer" placeholderTextColor="#70858b" value={newManufacturer} onChangeText={setNewManufacturer}/><TextInput style={s.input} placeholder="Model" placeholderTextColor="#70858b" value={newModel} onChangeText={setNewModel}/><TextInput style={s.input} placeholder="Serial number" placeholderTextColor="#70858b" value={newSerial} onChangeText={setNewSerial}/><TextInput style={s.input} placeholder="Category" placeholderTextColor="#70858b" value={newCat} onChangeText={setNewCat}/><TouchableOpacity style={s.primary} disabled={!!busy} onPress={addEquipment}><Text style={s.primaryText}>{busy==='equipment'?'SAVING…':'ADD EQUIPMENT'}</Text></TouchableOpacity></View>:null}
  <View style={s.listMeta}><Text style={s.metaText}>{equipment.filter(e=>`${e.name} ${e.manufacturer||''} ${e.model||''}`.toLowerCase().includes(equipmentSearch.toLowerCase())).length} {equipment.filter(e=>`${e.name} ${e.manufacturer||''} ${e.model||''}`.toLowerCase().includes(equipmentSearch.toLowerCase())).length===1?'ITEM':'ITEMS'}</Text><Text style={s.metaText}>SORT: NAME⌄</Text></View>
 {equipment.filter(e=>`${e.name} ${e.manufacturer||''} ${e.model||''}`.toLowerCase().includes(equipmentSearch.toLowerCase())).map(e=><TouchableOpacity key={e.id} style={s.equipmentCard} onPress={()=>openEquipment(e)}><View style={s.machineThumb}><View style={s.thumbGlow}/><MaterialCommunityIcons name={machineIcon(e) as any} size={38} color="#ffb000"/></View><View style={s.equipmentInfo}><Text style={s.equipmentName}>{e.name}</Text><Text style={s.equipmentModel}>{[e.manufacturer,e.model].filter(Boolean).join(' ')||'Equipment'}</Text>{e.serial?<Text style={s.serialText}>SN: {e.serial}</Text>:null}<View style={s.categoryBadge}><Text style={s.categoryText}>{(e.category||'EQUIPMENT').toUpperCase()}</Text></View></View><MaterialCommunityIcons name="chevron-right" size={28} color="#ffb000"/></TouchableOpacity>)}
 </ScrollView><BottomNav active="equipment"/></SafeAreaView>;

 if(screen==='history')return <SafeAreaView style={s.safe}><StatusBar style="light"/><GearBackdrop/><TopBar title="MY DIAGNOSTICS" back="home"/><ScrollView contentContainerStyle={s.dashboardWrap}>
  <View style={s.activityHeader}><Text style={s.sectionTitle}>DIAGNOSTIC HISTORY</Text><Text style={s.viewAll}>VIEW ALL</Text></View>
  {repairs.length===0?<Text style={s.muted}>No saved repairs yet.</Text>:repairs.map((r,i)=><TouchableOpacity key={r.id} style={s.historyRow} onPress={()=>shareReport(r)}><View style={s.historyIcon}><MaterialCommunityIcons name={i===2?'car-pickup':'excavator'} size={27} color="#ffb000"/></View><View style={s.recentInfo}><Text style={s.recentTitle}>{r.equipment_name}</Text><Text style={s.recentSub}>{r.fix||r.symptom||'Diagnostic record'}</Text></View><View style={s.recentStatus}><Text style={r.status==='IN PROGRESS'?s.inProgress:s.completed}>{r.status||'COMPLETED'}</Text><Text style={s.recentDate}>{r.date||'Saved repair'}</Text></View></TouchableOpacity>)}
 </ScrollView><BottomNav active="history"/></SafeAreaView>;

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

 return <SafeAreaView style={s.safe}><GearBackdrop/><TopBar title="AI DIAGNOSIS" back="equipment"/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={8}>
  <ScrollView ref={diagnosisScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.dashboardWrap}>
  <View style={s.selectedMachine}><View style={s.machineThumb}><View style={s.thumbGlow}/><MaterialCommunityIcons name={machineIcon(selected) as any} size={38} color="#ffb000"/></View><View><Text style={s.activityTitle}>{selected?.name}</Text><Text style={s.featureSubLeft}>{[selected?.manufacturer,selected?.model].filter(Boolean).join(' ')||selected?.category}</Text></View></View><View style={s.stepper}><View style={s.stepActive}><Text style={s.stepNumberActive}>1</Text></View><View style={s.stepLine}/><View style={s.step}><Text style={s.stepNumber}>2</Text></View><View style={s.stepLine}/><View style={s.step}><Text style={s.stepNumber}>3</Text></View><View style={s.stepLine}/><View style={s.step}><Text style={s.stepNumber}>4</Text></View></View><View style={s.stepLabels}><Text style={s.stepLabelActive}>Symptoms</Text><Text style={s.stepLabel}>System</Text><Text style={s.stepLabel}>Tests</Text><Text style={s.stepLabel}>Results</Text></View>
  <Text style={s.diagnosisKicker}>SELECT SYMPTOMS</Text><Text style={s.diagnosisHint}>Select a common symptom or describe exactly what the machine is doing.</Text>
  {!last?<View style={s.symptomGrid}>{['Engine will not start','Loss of power','Overheating','Hydraulic system issue','Warning lights','Abnormal noises','Leaks'].map((item,i)=>{const active=symptomSelected(item);return <TouchableOpacity key={item} style={[s.symptomChoice,active&&s.symptomChoiceActive]} onPress={()=>toggleSymptom(item)}><View style={s.symptomIcon}><MaterialCommunityIcons name={(['engine-off-outline','speedometer-slow','thermometer-alert','hydraulic-oil-level','alert-outline','waveform','water-outline'] as any)[i]} size={18} color="#ffb000"/></View><Text style={s.symptomChoiceText}>{item}</Text><MaterialCommunityIcons name={active?'checkbox-marked':'checkbox-blank-outline'} size={19} color={active?'#ffb000':'#777d7f'}/></TouchableOpacity>})}</View>:null}
  <View style={s.attachmentRow}>
   <TouchableOpacity style={s.attachmentButton} disabled={!!busy} onPress={takePhoto}><MaterialCommunityIcons name="camera-outline" size={20} color="#ffb000"/><Text style={s.attachmentText}>{busy==='photo'?'Analyzing…':'Take photo'}</Text></TouchableOpacity>
   <TouchableOpacity style={s.attachmentButton} disabled={!!busy} onPress={choosePhoto}><MaterialCommunityIcons name="image-outline" size={20} color="#ffb000"/><Text style={s.attachmentText}>Choose photo</Text></TouchableOpacity>
   <TouchableOpacity style={s.attachmentButton} disabled={!!busy} onPress={uploadManual}><MaterialCommunityIcons name="file-pdf-box" size={20} color="#ffb000"/><Text style={s.attachmentText}>{busy==='manual'?'Uploading…':'Manual'}</Text></TouchableOpacity>
  </View>
  {visual&&<View style={s.evidence}><Text style={s.white}>{visual.description}</Text><Text style={s.muted}>Vision confidence: {Math.round((visual.confidence||0)*100)}%</Text></View>}
  {!last?<>
   <TextInput style={[s.input,{minHeight:110}]} multiline placeholder="Describe exactly what the machine is doing" placeholderTextColor="#6f8a96" value={symptom} onChangeText={setSymptom}/>
   <TouchableOpacity style={[s.primary,busy? s.disabled:null]} disabled={!!busy} onPress={()=>next()}><Text style={s.primaryText}>Start diagnosis</Text></TouchableOpacity>
  </>:<>
   <View style={s.card}><View style={s.cardHeader}><View style={s.assistantTitle}><MaterialCommunityIcons name="brain" size={21} color="#ffb000"/><Text style={s.tileTitle}>RepairPilot</Text></View><View style={[s.riskPill,last.risk?.level==='green'?s.riskGreen:last.risk?.level==='yellow'?s.riskYellow:s.riskRed]}><Text style={s.riskText}>Risk: {last.risk?.level?.toUpperCase()}</Text></View></View><Text style={s.white}>{last.next_step?.question||last.notes_for_record}</Text></View>
   {last.evidence?.map((e:any,i:number)=><View key={i} style={s.evidence}><Text style={s.evidenceTitle}>{evidenceLabel(e.source)}{e.citation?` — ${e.citation}`:''}</Text><Text style={s.muted}>{e.detail||''}</Text></View>)}
   {needsContextPhoto()&&last.status==='ask'?<View style={s.row}><TouchableOpacity style={s.contextAction} disabled={!!busy} onPress={takePhoto}><MaterialCommunityIcons name="camera-outline" size={20} color="#ffb000"/><Text style={s.contextText}>Take requested photo</Text></TouchableOpacity><TouchableOpacity style={s.contextAction} disabled={!!busy} onPress={choosePhoto}><Text style={s.contextText}>Choose photo</Text></TouchableOpacity></View>:null}
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
 gearLayer:{...StyleSheet.absoluteFill,overflow:'hidden',backgroundColor:'#090b0d'},bgImage:{opacity:.82},bgShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(4,6,7,.06)'},distressTexture:{...StyleSheet.absoluteFill,width:'100%',height:'100%',opacity:.74},gear:{position:'absolute',color:'rgba(123,128,130,.13)',fontWeight:'400',textShadowColor:'rgba(255,179,0,.12)',textShadowRadius:16},amberGlow:{position:'absolute',borderRadius:999,backgroundColor:'rgba(255,153,0,.10)'},steelTop:{position:'absolute',left:0,right:0,top:0,height:92,backgroundColor:'rgba(9,11,12,.60)',borderBottomColor:'rgba(255,179,0,.48)',borderBottomWidth:1},hazardRail:{position:'absolute',left:0,right:0,bottom:0,height:8,backgroundColor:'#c88700',opacity:.62},bolt:{position:'absolute',width:8,height:8,borderRadius:4,backgroundColor:'#73787a',borderWidth:1,borderColor:'#151719'},meshLine:{position:'absolute',left:20,right:20,top:92,height:1,backgroundColor:'rgba(255,179,0,.24)'},
 title:{fontSize:28,fontWeight:'900',color:'#f4f4f0',marginBottom:15,textShadowColor:'rgba(0,0,0,.8)',textShadowRadius:5},muted:{color:'#aeb2b4',lineHeight:20},white:{color:'#f6fbff',fontSize:16},link:{color:'#ffc027',marginTop:8,fontWeight:'700'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:11},tile:{width:'48%',backgroundColor:'rgba(27,29,30,.96)',borderColor:'rgba(255,179,0,.55)',borderWidth:1,borderRadius:18,padding:17,minHeight:112,shadowColor:'#ffb300',shadowOpacity:.14,shadowRadius:12,shadowOffset:{width:0,height:5}},
 tileTitle:{color:'#f7fcff',fontWeight:'900',fontSize:18,marginBottom:5},card:{backgroundColor:'rgba(25,27,28,.97)',borderColor:'rgba(255,179,0,.58)',borderWidth:1,borderRadius:19,padding:17,marginTop:13,shadowColor:'#ffb300',shadowOpacity:.12,shadowRadius:14,shadowOffset:{width:0,height:5}},
 evidence:{backgroundColor:'rgba(20,22,23,.97)',borderColor:'rgba(117,122,124,.7)',borderWidth:1,borderRadius:13,padding:12,marginTop:10},
 input:{backgroundColor:'rgba(18,20,21,.98)',borderColor:'rgba(104,109,111,.8)',borderWidth:1,borderRadius:14,padding:14,color:'#fff',fontSize:16,marginBottom:10},
 primary:{backgroundColor:'#ffb300',borderColor:'#ffd05a',borderWidth:1,borderRadius:14,padding:15,marginTop:8,shadowColor:'#ffb300',shadowOpacity:.22,shadowRadius:10,shadowOffset:{width:0,height:4}},primaryText:{textAlign:'center',fontWeight:'900',color:'#15110a'},
 secondary:{backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(112,117,119,.78)',borderWidth:1,borderRadius:14,padding:14,marginTop:8},
 row:{flexDirection:'row',gap:10,marginBottom:10},secondaryHalf:{flex:1,backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(112,117,119,.78)',borderWidth:1,borderRadius:14,padding:14},
 cardHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8},assistantTitle:{flexDirection:'row',alignItems:'center',gap:7},riskPill:{borderRadius:999,paddingHorizontal:10,paddingVertical:5},riskGreen:{backgroundColor:'#0a6d2c'},riskYellow:{backgroundColor:'#80680b'},riskRed:{backgroundColor:'#812929'},riskText:{color:'#fff',fontWeight:'900',fontSize:12},evidenceTitle:{color:'#ffc027',fontWeight:'900',fontSize:14,marginBottom:4},contextAction:{flex:1,flexDirection:'row',gap:6,justifyContent:'center',alignItems:'center',backgroundColor:'rgba(42,37,25,.98)',borderColor:'#ffb300',borderWidth:1,borderRadius:14,padding:12,marginTop:10},contextText:{color:'#ffe2a0',fontWeight:'900',textAlign:'center'},thinking:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:'rgba(42,37,25,.98)',borderColor:'#ffb300',borderWidth:1,borderRadius:15,padding:14,marginTop:12},thinkingTitle:{color:'#fff',fontWeight:'900',marginBottom:3},pauseBox:{backgroundColor:'rgba(44,39,26,.98)',borderColor:'#ffc027',borderWidth:1,borderRadius:15,padding:14,marginTop:12},pauseTitle:{color:'#ffd46b',fontWeight:'900',fontSize:17,marginBottom:6},outcomeButton:{backgroundColor:'rgba(31,33,34,.98)',borderColor:'rgba(255,179,0,.55)',borderWidth:1,borderRadius:14,padding:14,marginTop:12},outcomeText:{color:'#f4f4f0',textAlign:'center',fontWeight:'900'},disabled:{opacity:.55},stopBox:{backgroundColor:'rgba(79,27,27,.97)',borderColor:'#ff8585',borderWidth:1,borderRadius:15,padding:14,marginTop:12},stopTitle:{color:'#ffd0d0',fontWeight:'900',fontSize:16,marginBottom:6}
,
 topBar:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:'rgba(255,176,0,.70)',backgroundColor:'rgba(7,9,10,.88)',shadowColor:'#000',shadowOpacity:.9,shadowRadius:7},wordmarkRow:{flexDirection:'row',alignItems:'center',gap:5},wordmarkIcon:{display:'none',width:0,height:0},topBrand:{color:'#f5f5f2',fontSize:23,fontFamily:Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed',web:'Impact'}),fontWeight:'900',fontStyle:'italic',letterSpacing:-.3,textShadowColor:'rgba(255,255,255,.16)',textShadowRadius:1},topIcon:{color:'#e9e9e5',fontSize:23,minWidth:26,textAlign:'center'},topHit:{width:42,height:42,alignItems:'center',justifyContent:'center'},previewBar:{height:0,zIndex:20},previewBarTitle:{height:0,overflow:'hidden',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},previewBarText:{color:'#c88b00',fontSize:7,fontWeight:'900',letterSpacing:.55},previewPicker:{position:'absolute',top:0,left:8,right:8,backgroundColor:'#111415',borderWidth:1,borderColor:'#ffb000',padding:5,flexDirection:'row',flexWrap:'wrap',gap:4,shadowColor:'#000',shadowOpacity:.8,shadowRadius:12,shadowOffset:{width:0,height:6}},previewChoice:{width:'49.3%',paddingVertical:10,paddingHorizontal:10,borderWidth:1,borderColor:'#3d4345',backgroundColor:'#191c1d'},previewChoiceActive:{backgroundColor:'#ffb000',borderColor:'#ffd05a'},previewChoiceText:{color:'#e8e9e6',fontSize:11,fontWeight:'800'},previewChoiceTextActive:{color:'#15110a'},bottomNav:{height:64,flexDirection:'row',borderTopWidth:1,borderTopColor:'rgba(122,128,130,.72)',backgroundColor:'rgba(7,9,10,.90)',paddingBottom:4,shadowColor:'#000',shadowOpacity:.9,shadowRadius:8},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navIcon:{color:'#8c9295',fontSize:19},navLabel:{color:'#858b8d',fontSize:8,marginTop:3,fontWeight:'800'},navActive:{color:'#ffb000'},
 authWrap:{paddingHorizontal:26,paddingTop:36,paddingBottom:36},logoCircle:{alignSelf:'center',width:100,height:100,borderRadius:50,borderWidth:6,borderColor:'#ffb300',backgroundColor:'#171a1b',alignItems:'center',justifyContent:'center',shadowColor:'#ffb300',shadowOpacity:.22,shadowRadius:18},logoTools:{fontSize:44,color:'#ffb300'},loginLogo:{alignSelf:'center',width:112,height:112,borderRadius:56},loginBrand:{textAlign:'center',fontSize:40,fontFamily:Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed'}),fontWeight:'900',fontStyle:'italic',color:'#f2f2ee',marginTop:12},loginTag:{textAlign:'center',fontSize:11,fontWeight:'900',letterSpacing:1.7,color:'#d7d8d6',marginBottom:32},fieldLabel:{color:'#ffb300',fontSize:12,fontWeight:'900',marginBottom:7,marginTop:10},loginInput:{backgroundColor:'rgba(17,20,21,.96)',borderWidth:1,borderColor:'#3b4144',borderRadius:7,padding:14,color:'#fff',fontSize:15},forgot:{color:'#ffb300',fontSize:12,textAlign:'right',marginTop:8},signIn:{backgroundColor:'#ffb300',borderRadius:7,padding:15,marginTop:18},orRow:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:18},orLine:{height:1,backgroundColor:'#555',flex:1},orText:{color:'#ddd',fontSize:12},createAccount:{borderWidth:1,borderColor:'#ffb300',borderRadius:7,padding:14,marginTop:10},createAccountText:{color:'#ffb300',textAlign:'center',fontWeight:'900'},version:{color:'#73787a',textAlign:'center',fontSize:11,marginTop:28},
 dashboardWrap:{paddingHorizontal:12,paddingTop:10,paddingBottom:76},welcomeBlock:{minHeight:108,paddingHorizontal:2,paddingTop:12,paddingBottom:14,borderBottomWidth:1,borderBottomColor:'rgba(255,176,0,.48)',justifyContent:'center'},welcomeSmall:{color:'#d6d7d5',fontSize:12},welcomeName:{color:'#fff',fontSize:30,fontFamily:Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed',web:'Impact'}),fontWeight:'900',textShadowColor:'rgba(0,0,0,.9)',textShadowRadius:2},welcomeSub:{color:'#b0b4b5',fontSize:12,marginTop:2},sectionHeader:{flexDirection:'row',alignItems:'center',gap:8,marginTop:13,marginBottom:8},sectionTitle:{color:'#ffb000',fontSize:15,fontFamily:Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed',web:'Arial Narrow'}),fontWeight:'900',letterSpacing:.45,textShadowColor:'rgba(255,176,0,.22)',textShadowRadius:3},sectionRail:{height:1,flex:1,backgroundColor:'rgba(255,176,0,.52)',borderRightWidth:24,borderRightColor:'rgba(112,116,116,.34)'},featureGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},featureTile:{width:'32%',minHeight:154,borderWidth:1,borderTopColor:'rgba(255,194,62,.76)',borderLeftColor:'rgba(255,176,0,.60)',borderRightColor:'rgba(116,91,29,.70)',borderBottomColor:'rgba(116,91,29,.72)',borderRadius:4,backgroundColor:'rgba(12,14,15,.84)',paddingHorizontal:5,paddingVertical:11,alignItems:'center',justifyContent:'center',position:'relative',shadowColor:'#ffb000',shadowOpacity:.24,shadowRadius:9},featureIconBox:{width:48,height:46,alignItems:'center',justifyContent:'center',marginBottom:8},featureIconText:{color:'#ffb300',fontSize:38,fontWeight:'700'},featureTitle:{color:'#f5f5f2',fontFamily:Platform.select({ios:'AvenirNextCondensed-DemiBold',android:'sans-serif-condensed',web:'Arial Narrow'}),fontWeight:'900',fontSize:13,textAlign:'center',letterSpacing:.1,textShadowColor:'rgba(0,0,0,.95)',textShadowRadius:2},featureSub:{color:'#b1b5b6',fontSize:10.5,lineHeight:14,textAlign:'center',marginTop:7},newBadge:{position:'absolute',right:5,top:5,backgroundColor:'#ffb000',color:'#111',fontWeight:'900',fontSize:8,paddingHorizontal:5,paddingVertical:3,borderRadius:9},activityRow:{borderWidth:1,borderColor:'#555b5d',borderRadius:3,backgroundColor:'rgba(14,16,17,.86)',paddingHorizontal:12,paddingVertical:9,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},activityTitle:{color:'#f4f4f0',fontFamily:Platform.select({ios:'AvenirNextCondensed-DemiBold',android:'sans-serif-condensed',web:'Arial Narrow'}),fontSize:14,fontWeight:'900'},activityHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:15,marginBottom:7},viewAll:{color:'#ffb000',fontSize:9,fontWeight:'900'},recentRow:{minHeight:54,flexDirection:'row',alignItems:'center',gap:9,borderWidth:1,borderColor:'rgba(103,109,111,.78)',borderLeftColor:'rgba(255,176,0,.58)',backgroundColor:'rgba(12,15,16,.84)',paddingHorizontal:10,paddingVertical:7},historyRow:{minHeight:64,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'rgba(103,109,111,.78)',borderLeftColor:'rgba(255,176,0,.58)',backgroundColor:'rgba(12,15,16,.84)',paddingHorizontal:10,paddingVertical:8,marginBottom:5},historyIcon:{width:38,alignItems:'center'},recentInfo:{flex:1},recentTitle:{color:'#f5f5f2',fontSize:12,fontWeight:'800'},recentSub:{color:'#9ca2a4',fontSize:9,marginTop:2},recentStatus:{alignItems:'flex-end'},completed:{color:'#76d34f',fontSize:9,fontWeight:'900'},inProgress:{color:'#5db9e8',fontSize:9,fontWeight:'900'},recentDate:{color:'#a9adae',fontSize:8,marginTop:2},chevron:{color:'#ffb000',fontSize:25,marginLeft:8},logoutLink:{padding:12,alignItems:'center'},
 searchRow:{flexDirection:'row',gap:7},searchInput:{flex:1,backgroundColor:'rgba(16,18,19,.84)',borderWidth:1,borderColor:'#686e70',borderRadius:3,paddingHorizontal:11,paddingVertical:8,color:'#fff'},filterButton:{width:42,borderWidth:1,borderColor:'#ffb000',borderRadius:3,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(10,12,13,.76)'},filterText:{color:'#ffb000',fontSize:25},addPanel:{borderWidth:1,borderColor:'#555b5d',backgroundColor:'rgba(12,15,16,.84)',borderRadius:4,padding:11,marginTop:9},listMeta:{flexDirection:'row',justifyContent:'space-between',marginTop:8,marginBottom:5,paddingHorizontal:2},metaText:{color:'#8c9295',fontSize:8.5,fontWeight:'800',letterSpacing:.5},equipmentRow:{flexDirection:'row',alignItems:'center',gap:9,borderBottomWidth:1,borderBottomColor:'#303537',paddingVertical:10},equipmentCard:{flexDirection:'row',alignItems:'center',gap:9,borderWidth:1,borderColor:'rgba(106,111,113,.82)',borderLeftWidth:2,borderLeftColor:'#a97600',backgroundColor:'rgba(13,15,16,.86)',borderRadius:3,padding:7,marginBottom:5,shadowColor:'#000',shadowOpacity:.55,shadowRadius:4},equipmentInfo:{flex:1},equipmentName:{color:'#f5f5f2',fontFamily:Platform.select({ios:'AvenirNextCondensed-DemiBold',android:'sans-serif-condensed',web:'Arial Narrow'}),fontWeight:'900',fontSize:14.5,textShadowColor:'rgba(0,0,0,.9)',textShadowRadius:2},equipmentModel:{color:'#a6abad',fontSize:9.5,marginTop:1},equipmentChevron:{color:'#ffb300',fontSize:27,paddingLeft:5},machineThumb:{width:60,height:50,borderRadius:3,borderWidth:1,borderColor:'#707678',backgroundColor:'rgba(23,27,28,.83)',alignItems:'center',justifyContent:'center',overflow:'hidden'},thumbGlow:{position:'absolute',width:54,height:32,borderRadius:27,backgroundColor:'rgba(255,176,0,.10)'},machineIcon:{fontSize:27,color:'#9da2a4'},serialText:{color:'#747b7e',fontSize:7.5,marginTop:2},categoryBadge:{alignSelf:'flex-start',borderWidth:1,borderColor:'#a97600',backgroundColor:'rgba(44,34,8,.76)',paddingHorizontal:6,paddingVertical:1,borderRadius:2,marginTop:3,maxWidth:110},categoryText:{color:'#ffc027',fontSize:6.5,fontWeight:'900'},selectedMachine:{flexDirection:'row',gap:9,alignItems:'center',borderWidth:1,borderColor:'#5c6264',borderTopColor:'#a97600',backgroundColor:'rgba(13,16,17,.86)',padding:8,marginBottom:10},stepper:{flexDirection:'row',alignItems:'center',paddingHorizontal:16},step:{width:26,height:26,borderRadius:13,borderWidth:1,borderColor:'#6b7173',alignItems:'center',justifyContent:'center',backgroundColor:'rgba(17,20,21,.82)'},stepActive:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#ffb000'},stepNumber:{color:'#ddd',fontSize:11},stepNumberActive:{color:'#111',fontSize:11,fontWeight:'900'},stepLine:{height:1,backgroundColor:'#51575a',flex:1},stepLabels:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:2,marginTop:4,marginBottom:9},stepLabel:{color:'#8c9295',fontSize:8,width:'25%',textAlign:'center'},stepLabelActive:{color:'#ffb000',fontSize:8,fontWeight:'900',width:'25%',textAlign:'center'},diagnosisKicker:{color:'#ffb000',fontFamily:Platform.select({ios:'AvenirNextCondensed-Heavy',android:'sans-serif-condensed',web:'Arial Narrow'}),fontWeight:'900',fontSize:12,letterSpacing:.5,marginBottom:1},diagnosisHint:{color:'#8f9698',fontSize:9,marginBottom:7},symptomGrid:{borderWidth:1,borderColor:'#53595b',borderRadius:3,overflow:'hidden',marginBottom:7},symptomChoice:{height:36,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8,backgroundColor:'rgba(13,16,17,.86)',borderBottomWidth:1,borderBottomColor:'#303537'},symptomChoiceActive:{backgroundColor:'rgba(51,39,9,.90)'},symptomIcon:{width:23,alignItems:'center'},symptomChoiceText:{flex:1,color:'#e8e9e6',fontSize:10.5,fontWeight:'700'},symptomChoiceTextActive:{color:'#15110a',fontWeight:'900'},attachmentRow:{flexDirection:'row',gap:5,marginBottom:7},attachmentButton:{flex:1,minHeight:46,borderWidth:1,borderColor:'#666c6e',borderRadius:3,backgroundColor:'rgba(18,20,21,.84)',alignItems:'center',justifyContent:'center',padding:4},attachmentText:{color:'#e5e6e3',fontSize:7.5,fontWeight:'800',marginTop:2,textAlign:'center'},
  scanTabs:{flexDirection:'row',gap:5,marginBottom:12},scanTab:{flex:1,borderWidth:1,borderColor:'#5f6567',backgroundColor:'rgba(15,18,19,.84)',paddingVertical:10,borderRadius:3,alignItems:'center'},scanTabActive:{backgroundColor:'#ffb300',borderColor:'#ffd05a'},scanTabText:{color:'#d7d9d9',fontSize:9,fontWeight:'900'},scanTabTextActive:{color:'#111'},scannerFrame:{height:420,borderWidth:1,borderTopColor:'#d59b18',borderLeftColor:'#a97700',borderRightColor:'#6e5417',borderBottomColor:'#6e5417',backgroundColor:'rgba(8,11,12,.84)',borderRadius:4,overflow:'hidden',alignItems:'center',justifyContent:'center',position:'relative',shadowColor:'#ffb000',shadowOpacity:.16,shadowRadius:8},scannerImage:{...StyleSheet.absoluteFill,width:'100%',height:'100%'},scanGrid:{...StyleSheet.absoluteFill,opacity:.14,borderWidth:1,borderColor:'#667'},scanReady:{position:'absolute',top:16,color:'#6dff62',borderWidth:1,borderColor:'#23801f',paddingHorizontal:8,paddingVertical:3,fontSize:10,fontWeight:'900'},scanTarget:{color:'#d7d9d9',fontSize:160,opacity:.55},corner:{position:'absolute',width:36,height:36,borderColor:'#fff'},cTL:{left:22,top:58,borderLeftWidth:3,borderTopWidth:3},cTR:{right:22,top:58,borderRightWidth:3,borderTopWidth:3},cBL:{left:22,bottom:28,borderLeftWidth:3,borderBottomWidth:3},cBR:{right:22,bottom:28,borderRightWidth:3,borderBottomWidth:3},scanHelp:{color:'#e3e3df',textAlign:'center',lineHeight:19,marginVertical:15},scanControls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},scanSide:{width:82,height:72,borderWidth:1,borderColor:'#5b6163',backgroundColor:'rgba(16,19,20,.84)',borderRadius:4,alignItems:'center',justifyContent:'center'},scanSideIcon:{color:'#f3f3ef',fontSize:22},scanSideText:{color:'#f3f3ef',fontSize:8,fontWeight:'900',textAlign:'center'},shutter:{width:78,height:78,borderRadius:39,borderWidth:4,borderColor:'#ffb300',alignItems:'center',justifyContent:'center',shadowColor:'#ffb000',shadowOpacity:.34,shadowRadius:9},shutterInner:{width:60,height:60,borderRadius:30,backgroundColor:'#ffb300',borderWidth:2,borderColor:'#ffd05a'},devNotice:{borderWidth:1,borderColor:'#5c6264',backgroundColor:'rgba(14,17,18,.84)',borderRadius:3,padding:12,marginTop:12},heroTool:{borderWidth:1,borderColor:'#a97700',backgroundColor:'rgba(14,17,18,.84)',padding:22,borderRadius:4,alignItems:'center'},heroToolIcon:{color:'#ffb300',fontSize:56,fontWeight:'900'},heroToolTitle:{color:'#ffb300',fontSize:18,fontWeight:'900',marginTop:8,textAlign:'center'},heroToolText:{color:'#c4c8c9',fontSize:13,lineHeight:20,textAlign:'center',marginTop:8},arRow:{flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'#454a4c',paddingVertical:14},arNum:{width:34,height:34,borderRadius:17,backgroundColor:'#ffb300',alignItems:'center',justifyContent:'center'},arCamera:{height:390,borderWidth:1,borderTopColor:'#d59b18',borderLeftColor:'#a97700',borderRightColor:'#6e5417',borderBottomColor:'#6e5417',backgroundColor:'rgba(8,11,12,.84)',borderRadius:3,overflow:'hidden',position:'relative',alignItems:'center',justifyContent:'center'},arGrid:{...StyleSheet.absoluteFill,backgroundColor:'rgba(29,35,36,.66)',borderWidth:1,borderColor:'#343a3c'},arFocus:{alignItems:'center',justifyContent:'center'},arReady:{color:'#7dff68',fontSize:9,fontWeight:'900',marginTop:5,borderWidth:1,borderColor:'#317c2e',paddingHorizontal:8,paddingVertical:3},arStepCard:{position:'absolute',left:16,right:16,top:16,borderWidth:1,borderColor:'#6b7173',backgroundColor:'rgba(7,9,10,.78)',padding:9},arStepKicker:{color:'#ffb000',fontSize:8,fontWeight:'900'},arStepText:{color:'#f0f1ee',fontSize:11,marginTop:3},arControls:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8},arControl:{width:64,height:52,borderWidth:1,borderColor:'#5d6365',backgroundColor:'rgba(17,20,21,.84)',alignItems:'center',justifyContent:'center'},arPrimary:{flex:1,height:52,backgroundColor:'#ffb000',flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center'},arPrimaryText:{color:'#111',fontWeight:'900',fontSize:11},featureSubLeft:{color:'#a3a8aa',fontSize:10,lineHeight:14,marginTop:3},emptyIndustrial:{borderWidth:1,borderColor:'#5c6264',backgroundColor:'rgba(14,17,18,.84)',borderRadius:4,padding:28,alignItems:'center'},profileCard:{flexDirection:'row',gap:14,borderWidth:1,borderColor:'#696f71',backgroundColor:'rgba(14,16,17,.84)',borderRadius:4,padding:16,marginBottom:10},profileIcon:{width:52,height:52,alignItems:'center',justifyContent:'center'},profileIconText:{color:'#ffb300',fontSize:39},profileTitle:{color:'#ffb300',fontWeight:'900',fontSize:13,marginBottom:7},profileText:{color:'#b8bcbd',fontSize:12,lineHeight:18},actionList:{borderWidth:1,borderColor:'#696f71',backgroundColor:'rgba(14,16,17,.84)',borderRadius:4,overflow:'hidden',marginBottom:12},actionRow:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#444a4c'},actionIcon:{color:'#f4f4f0',fontSize:24,width:34},actionText:{color:'#f4f4f0',fontWeight:'800',fontSize:13,flex:1},actionChevron:{color:'#ffb300',fontSize:27},safetyCard:{flexDirection:'row',gap:14,borderWidth:1,borderColor:'#696f71',backgroundColor:'rgba(14,16,17,.84)',borderRadius:4,padding:16,marginTop:4},safetyShield:{width:48,height:56,borderWidth:2,borderColor:'#ffb300',borderRadius:18,alignItems:'center',justifyContent:'center'},safetyShieldText:{color:'#ffb300',fontSize:22,fontWeight:'900'},redText:{color:'#ff6b6b',fontWeight:'900'},backCard:{height:56,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#696f71',backgroundColor:'rgba(14,16,17,.84)',borderRadius:4,paddingHorizontal:14,marginTop:14}
});
