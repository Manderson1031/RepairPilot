from pathlib import Path

p=Path('app/index.tsx')
s=p.read_text()

replacements={
"const nav=(to:Screen)=>{setMenuOpen(false);if(!previewMode&&to==='scanner'){Linking.openURL('repairpilot://hardware-scanner').catch(()=>setScreen('scanner'));return}if(!previewMode&&to==='ar'){Linking.openURL('repairpilot://ar-assist').catch(()=>setScreen('ar'));return}if(to==='equipment')loadEquipment();if(to==='history'){loadHistory();return}setScreen(to)};":
"const nav=(to:Screen)=>{setMenuOpen(false);if(!previewMode&&to==='scanner'){Linking.openURL('repairpilot://hardware-scanner').catch(()=>setScreen('scanner'));return}if(!previewMode&&to==='ar'){Linking.openURL('repairpilot://ar-assist').catch(()=>setScreen('ar'));return}if(!previewMode&&to==='maintenance'){Linking.openURL('repairpilot://maintenance-center').catch(()=>setScreen('maintenance'));return}if(to==='equipment')loadEquipment();if(to==='history'){loadHistory();return}setScreen(to)};",
"['equipment','excavator','MY EQUIPMENT']":"['equipment','engine-outline','MY EQUIPMENT']",
"['equipment','excavator','Equipment']":"['equipment','engine-outline','Equipment']",
"<Feature icon=\"excavator\" title=\"MY EQUIPMENT\"":"<Feature icon=\"engine-outline\" title=\"MY EQUIPMENT\"",
"<MaterialCommunityIcons name=\"excavator\" size={28} color={AMBER}/>":"<MaterialCommunityIcons name=\"engine-outline\" size={28} color={AMBER}/>",
}
for old,new in replacements.items():
    if old not in s:
        raise SystemExit(f'Expected app-shell pattern missing: {old[:80]}')
    s=s.replace(old,new)

old="const symptoms=[['engine-outline','Engine will not start'],['speedometer-slow','Loss of power'],['thermometer-alert','Overheating'],['hydraulic-oil-level','Hydraulic system issue'],['alert-outline','Warning lights'],['waveform','Abnormal noises'],['water-outline','Leaks']];"
new="""const symptomsForEquipment=(e:any)=>{\n  const t=`${e?.category||''} ${e?.name||''} ${e?.manufacturer||''} ${e?.model||''}`.toLowerCase();\n  const engine=[['engine-outline','Engine will not start'],['speedometer-slow','Loss of power'],['thermometer-alert','Overheating'],['fuel','Fuel system issue'],['battery-alert-variant-outline','Electrical / charging issue'],['waveform','Abnormal noises'],['water-outline','Leaks']];\n  if(/mower|lawn tractor|riding tractor|husqvarna.*yth/.test(t))return [...engine,['cog-transfer-outline','Drive / transmission issue'],['mower','Deck / blade issue'],['power-plug-outline','PTO / blade engagement issue'],['vector-polyline','Belt / pulley issue'],['steering','Steering issue']];\n  if(/welder|welding|generator/.test(t))return [...engine,['flash-outline','No / low electrical output'],['power-plug-off-outline','Receptacle / connection issue']];\n  if(/compressor|pneumatic|air tool/.test(t))return [['engine-outline','Engine / motor issue'],['gauge','Pressure will not build'],['air-filter','Air flow / restriction issue'],['valve','Valve / regulator issue'],['water-outline','Air / oil leak'],['battery-alert-variant-outline','Electrical issue'],['waveform','Abnormal noises']];\n  const out:any[]=[...engine];\n  if(/hydraulic|excavator|loader|skid|forklift|press|brake|backhoe|lift/.test(t))out.push(['hydraulic-oil-level','Hydraulic system issue']);\n  if(/pneumatic|air/.test(t))out.push(['air-filter','Pneumatic / air system issue']);\n  return out;\n };\n const symptoms=symptomsForEquipment(selected);"""
if old not in s: raise SystemExit('Expected generic symptom list missing')
s=s.replace(old,new)

old_diag="<View style={s.twoButtons}><TouchableOpacity style={s.outlineHalf} onPress={takeDiagnosticPhoto}><MaterialCommunityIcons name=\"camera-outline\" size={19} color={AMBER}/><Text style={s.outlineText}>ADD PHOTO</Text></TouchableOpacity><TouchableOpacity style={s.primaryHalf} onPress={()=>setScreen('complete')}><Text style={s.primaryText}>FINISH REPAIR</Text></TouchableOpacity></View></>}"
new_diag="<View style={s.twoButtons}><TouchableOpacity style={s.outlineHalf} onPress={takeDiagnosticPhoto}><MaterialCommunityIcons name=\"camera-outline\" size={19} color={AMBER}/><Text style={s.outlineText}>ADD PHOTO</Text></TouchableOpacity><TouchableOpacity style={s.primaryHalf} onPress={()=>setScreen('complete')}><Text style={s.primaryText}>FINISH REPAIR</Text></TouchableOpacity></View><TouchableOpacity style={s.outlineButton} onPress={()=>Linking.openURL(`repairpilot://ar-assist?mode=guided&equipmentId=${encodeURIComponent(String(selected?.id||''))}&equipmentName=${encodeURIComponent(String(selected?.name||''))}&sessionId=${encodeURIComponent(String(last?.session_id||''))}`)}><MaterialCommunityIcons name=\"cube-scan\" size={19} color={AMBER}/><Text style={s.outlineText}>OPEN GUIDED AR FOR THIS DIAGNOSIS</Text></TouchableOpacity></>}"
if old_diag not in s: raise SystemExit('Expected diagnosis action block missing')
s=s.replace(old_diag,new_diag)

p.write_text(s)
print('Applied RepairPilot app-shell changes: equipment-aware diagnosis, engine icon, guided AR entry, maintenance center routing.')
