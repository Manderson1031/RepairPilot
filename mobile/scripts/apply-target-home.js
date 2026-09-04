const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app', 'index.tsx');
let src = fs.readFileSync(file, 'utf8');

function replace(oldText, newText) {
  if (!src.includes(oldText)) throw new Error(`Target-home patch could not find expected source: ${oldText.slice(0, 90)}`);
  src = src.replace(oldText, newText);
}

// Rebuild the dashboard geometry from the physical-iPhone comparison against
// the approved design master. The previous pass compressed the vertical stack
// too aggressively; this pass restores the target's dense, nearly full-height
// dashboard composition.
replace(
  'const TopBar=({title,back}:{title?:string,back?:Screen})=><View style={s.topBar}>{back?<TouchableOpacity style={s.topHit} onPress={()=>nav(back)}><MaterialCommunityIcons name="chevron-left" size={28} color={TEXT}/></TouchableOpacity>:<TouchableOpacity style={s.topHit} onPress={()=>setMenuOpen(v=>!v)}><MaterialCommunityIcons name="menu" size={29} color={TEXT}/></TouchableOpacity>}<Text numberOfLines={1} style={[s.topTitle,!title&&s.brandTitle]}>{title||<>REPAIR<Text style={s.amber}>PILOT</Text></>}</Text><TouchableOpacity style={s.topHit} onPress={()=>nav(\'settings\')}><MaterialCommunityIcons name="bell-outline" size={23} color={TEXT}/></TouchableOpacity></View>;',
  'const TopBar=({title,back}:{title?:string,back?:Screen})=><View style={s.topBar}>{back?<TouchableOpacity style={s.topHit} onPress={()=>nav(back)}><MaterialCommunityIcons name="chevron-left" size={26} color={TEXT}/></TouchableOpacity>:<TouchableOpacity style={s.topHit} onPress={()=>setMenuOpen(v=>!v)}><MaterialCommunityIcons name="menu" size={26} color={TEXT}/></TouchableOpacity>}<Text numberOfLines={1} style={[s.topTitle,!title&&s.brandTitle]}>{title||<>REPAIR<Text style={s.amber}>PILOT</Text></>}</Text><TouchableOpacity style={s.topHit} onPress={()=>nav(\'settings\')}><MaterialCommunityIcons name="bell-outline" size={21} color={TEXT}/></TouchableOpacity></View>;'
);
replace(
  'const BottomNav=({active}:{active:string})=><View style={s.bottomNav}>{([[\'home\',\'home\',\'Home\'],[\'equipment\',\'excavator\',\'Equipment\'],[\'history\',\'shield-wrench-outline\',\'Diagnosis\'],[\'scanner\',\'line-scan\',\'Scanner\'],[\'ar\',\'cube-scan\',\'AR Assist\'],[\'settings\',\'account-outline\',\'Profile\']] as const).map(([key,icon,label])=><TouchableOpacity key={key} style={s.navItem} onPress={()=>nav(key as Screen)}><MaterialCommunityIcons name={icon as any} size={22} color={active===key?AMBER:\'#898a86\'}/><Text style={[s.navText,active===key&&s.navActive]}>{label}</Text></TouchableOpacity>)}</View>;',
  'const BottomNav=({active}:{active:string})=><View style={s.bottomNav}>{([[\'home\',\'home\',\'Home\'],[\'equipment\',\'excavator\',\'Equipment\'],[\'history\',\'shield-wrench-outline\',\'Diagnosis\'],[\'scanner\',\'line-scan\',\'Scanner\'],[\'ar\',\'cube-scan\',\'AR Assist\'],[\'settings\',\'account-outline\',\'Profile\']] as const).map(([key,icon,label])=><TouchableOpacity key={key} style={s.navItem} onPress={()=>nav(key as Screen)}><MaterialCommunityIcons name={icon as any} size={21} color={active===key?AMBER:\'#898a86\'}/><Text style={[s.navText,active===key&&s.navActive]}>{label}</Text></TouchableOpacity>)}</View>;'
);
replace(
  'const Feature=({icon,title,sub,onPress,badge}:{icon:any,title:string,sub:string,onPress:()=>void,badge?:string})=><TouchableOpacity onPress={onPress} style={s.featureWrap}><Panel style={s.featureCard}><MaterialCommunityIcons name={icon} size={39} color={AMBER}/>{badge?<Text style={s.badge}>{badge}</Text>:null}<Text style={s.featureTitle}>{title}</Text><Text style={s.featureSub}>{sub}</Text></Panel></TouchableOpacity>;',
  'const Feature=({icon,title,sub,onPress,badge}:{icon:any,title:string,sub:string,onPress:()=>void,badge?:string})=><TouchableOpacity onPress={onPress} style={s.featureWrap}><Panel style={s.featureCard}><MaterialCommunityIcons name={icon} size={35} color={AMBER}/>{badge?<Text style={s.badge}>{badge}</Text>:null}<Text style={s.featureTitle}>{title}</Text><Text style={s.featureSub}>{sub}</Text></Panel></TouchableOpacity>;'
);
replace(
  'const Recent=({name,system,status,date,onPress}:{name:string,system:string,status:string,date:string,onPress?:()=>void})=><TouchableOpacity disabled={!onPress} onPress={onPress}><Panel style={s.recentRow}><MaterialCommunityIcons name="excavator" size={28} color={AMBER}/><View style={{flex:1}}><Text style={s.recentName}>{name}</Text><Text style={s.recentSub}>{system}</Text></View><View style={{alignItems:\'flex-end\'}}><Text style={status===\'IN PROGRESS\'?s.inProgress:s.completed}>{status}</Text><Text style={s.recentDate}>{date}</Text></View></Panel></TouchableOpacity>;',
  'const Recent=({name,system,status,date,onPress}:{name:string,system:string,status:string,date:string,onPress?:()=>void})=><TouchableOpacity disabled={!onPress} onPress={onPress}><Panel style={s.recentRow}><MaterialCommunityIcons name="excavator" size={25} color={AMBER}/><View style={{flex:1}}><Text style={s.recentName}>{name}</Text><Text style={s.recentSub}>{system}</Text></View><View style={{alignItems:\'flex-end\'}}><Text style={status===\'IN PROGRESS\'?s.inProgress:s.completed}>{status}</Text><Text style={s.recentDate}>{date}</Text></View></Panel></TouchableOpacity>;'
);

replace(
  "topBar:{height:60,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,backgroundColor:'rgba(4,5,6,.88)',borderBottomWidth:1.5,borderBottomColor:'#a86b00'},topHit:{width:42,height:42,alignItems:'center',justifyContent:'center'},topTitle:{maxWidth:'74%',color:TEXT,fontFamily:heavy,fontWeight:'900',fontStyle:'italic',fontSize:21,letterSpacing:-.2,textAlign:'center',textShadowColor:'#000',textShadowRadius:4},brandTitle:{fontSize:27,letterSpacing:-.8},",
  "topBar:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,backgroundColor:'rgba(4,5,6,.90)',borderBottomWidth:1.2,borderBottomColor:'#9d6500'},topHit:{width:40,height:40,alignItems:'center',justifyContent:'center'},topTitle:{maxWidth:'74%',color:TEXT,fontFamily:heavy,fontWeight:'900',fontStyle:'italic',fontSize:19,letterSpacing:-.2,textAlign:'center',textShadowColor:'#000',textShadowRadius:4},brandTitle:{fontSize:25,letterSpacing:-.8},"
);
replace(
  "content:{paddingHorizontal:13,paddingTop:8,paddingBottom:24},bottomNav:{height:66,flexDirection:'row',backgroundColor:'rgba(3,4,5,.96)',borderTopWidth:1.5,borderTopColor:'#664100'},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navText:{color:'#8d8e89',fontFamily:condensed,fontWeight:'900',fontSize:9,marginTop:2},navActive:{color:AMBER},",
  "content:{paddingHorizontal:12,paddingTop:5,paddingBottom:8},bottomNav:{height:68,flexDirection:'row',backgroundColor:'rgba(3,4,5,.97)',borderTopWidth:1.2,borderTopColor:'#664100'},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navText:{color:'#8d8e89',fontFamily:condensed,fontWeight:'900',fontSize:8.4,marginTop:2},navActive:{color:AMBER},"
);
replace(
  "welcome:{height:145,paddingTop:20,paddingHorizontal:7,justifyContent:'flex-start'},welcomeSmall:{color:'#dedbd3',fontFamily:condensed,fontSize:17,textShadowColor:'#000',textShadowRadius:4},welcomeName:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:35,letterSpacing:.2,textShadowColor:'#000',textShadowRadius:5,marginTop:-1},welcomeSub:{color:'#c5c1b8',fontFamily:condensed,fontSize:16,marginTop:2,textShadowColor:'#000',textShadowRadius:4},",
  "welcome:{height:132,paddingTop:17,paddingHorizontal:5,justifyContent:'flex-start'},welcomeSmall:{color:'#dedbd3',fontFamily:condensed,fontSize:14,textShadowColor:'#000',textShadowRadius:4},welcomeName:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:28,letterSpacing:.15,textShadowColor:'#000',textShadowRadius:5,marginTop:-1},welcomeSub:{color:'#c5c1b8',fontFamily:condensed,fontSize:12.5,marginTop:2,textShadowColor:'#000',textShadowRadius:4},"
);
replace(
  "sectionRow:{flexDirection:'row',alignItems:'center',gap:9,marginTop:8,marginBottom:8},sectionTitle:{color:AMBER,fontFamily:heavy,fontWeight:'900',fontSize:20,letterSpacing:.15,textShadowColor:'#1b0f00',textShadowRadius:3},sectionRule:{height:1.3,flex:1,backgroundColor:'#946000'},viewAll:{color:AMBER,fontFamily:heavy,fontWeight:'900',fontSize:10.5},",
  "sectionRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:6,marginBottom:7},sectionTitle:{color:AMBER,fontFamily:heavy,fontWeight:'900',fontSize:16,letterSpacing:.12,textShadowColor:'#1b0f00',textShadowRadius:3},sectionRule:{height:1.1,flex:1,backgroundColor:'#946000'},viewAll:{color:AMBER,fontFamily:heavy,fontWeight:'900',fontSize:8.5},"
);
replace(
  "featureGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:7},featureWrap:{width:'32.2%'},featureCard:{minHeight:150,borderRadius:6,alignItems:'center',justifyContent:'center',paddingHorizontal:6,paddingVertical:10},featureTitle:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:13.2,lineHeight:15,textAlign:'center',marginTop:8,textShadowColor:'#000',textShadowRadius:3},featureSub:{color:'#b7b2aa',fontFamily:condensed,fontSize:10.7,lineHeight:13,textAlign:'center',marginTop:5},badge:{position:'absolute',right:5,top:5,backgroundColor:AMBER,color:'#111',fontFamily:heavy,fontWeight:'900',fontSize:8.5,paddingHorizontal:7,paddingVertical:2,borderRadius:9},",
  "featureGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:6},featureWrap:{width:'32.1%'},featureCard:{height:168,borderRadius:4,alignItems:'center',justifyContent:'center',paddingHorizontal:5,paddingVertical:9},featureTitle:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:11.2,lineHeight:13,textAlign:'center',marginTop:7,textShadowColor:'#000',textShadowRadius:3},featureSub:{color:'#b7b2aa',fontFamily:condensed,fontSize:8.9,lineHeight:11,textAlign:'center',marginTop:4},badge:{position:'absolute',right:5,top:5,backgroundColor:AMBER,color:'#111',fontFamily:heavy,fontWeight:'900',fontSize:7,paddingHorizontal:6,paddingVertical:1.5,borderRadius:8},"
);
replace(
  "recentRow:{minHeight:59,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:9,paddingVertical:7,marginBottom:5},recentName:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:14},recentSub:{color:'#aaa69e',fontFamily:condensed,fontSize:10.5,marginTop:2},completed:{color:'#72d64f',fontFamily:heavy,fontWeight:'900',fontSize:9.5},inProgress:{color:'#55b9eb',fontFamily:heavy,fontWeight:'900',fontSize:9.5},recentDate:{color:'#b7b3aa',fontFamily:condensed,fontSize:9,marginTop:2},",
  "recentRow:{height:60,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:9,paddingVertical:6,marginBottom:5},recentName:{color:TEXT,fontFamily:heavy,fontWeight:'900',fontSize:12.2},recentSub:{color:'#aaa69e',fontFamily:condensed,fontSize:9.2,marginTop:1},completed:{color:'#72d64f',fontFamily:heavy,fontWeight:'900',fontSize:8.1},inProgress:{color:'#55b9eb',fontFamily:heavy,fontWeight:'900',fontSize:8.1},recentDate:{color:'#b7b3aa',fontFamily:condensed,fontSize:7.8,marginTop:1},"
);

// Dark, worn industrial treatment; keep the gear field visible through the full screen.
replace("safe:{flex:1,backgroundColor:'#050607'},amber:{color:AMBER},bgImage:{opacity:.94},bgShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.18)'},", "safe:{flex:1,backgroundColor:'#050607'},amber:{color:AMBER},bgImage:{opacity:.76},bgShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.30)'},");
replace("panel:{overflow:'hidden',borderWidth:1.35,borderColor:'#7c520c',backgroundColor:'rgba(11,12,12,.85)',position:'relative'},panelImage:{opacity:.22},panelShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(4,5,6,.42)'},", "panel:{overflow:'hidden',borderWidth:1.05,borderColor:'#7c520c',backgroundColor:'rgba(8,9,9,.90)',position:'relative'},panelImage:{opacity:.13},panelShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(3,4,5,.56)'},");

fs.writeFileSync(file, src);
console.log('Applied physical-iPhone calibrated RepairPilot target-home geometry.');
