export type HardwareKind='FASTENER'|'FITTING'|'BEARING'|'OTHER';

export type HardwareMeasurements={
  diameter_mm:number|null;
  length_mm:number|null;
  thread_pitch_mm:number|null;
  threads_per_inch:number|null;
  width_mm:number|null;
  height_mm:number|null;
};

export type HardwareCandidate={
  name?:string;
  reason?:string;
  confidence?:number;
  system?:'metric'|'inch'|string;
  thread_confirmed?:boolean;
  [key:string]:unknown;
};

export type HardwareScanResult={
  kind:HardwareKind;
  identified_part:string;
  standard:string;
  measurements:HardwareMeasurements;
  markings:string[];
  candidate_matches:HardwareCandidate[];
  confidence:number;
  needs_reference_scale:boolean;
  warnings:string[];
  depth_measurement?:{
    applied:boolean;
    source:string;
    confidence:number;
    fields?:string[];
  };
  thread_measurement?:{
    applied:boolean;
    source:string;
    confidence:number;
    interval_count?:number;
  };
  size_resolution?:{
    candidate_count:number;
    thread_confirmed:boolean;
    basis:string;
  };
};

export type HardwareReplacementPlan={
  kind:HardwareKind;
  readiness:string;
  search_ready:boolean;
  exact_replacement_ready:boolean;
  confidence:number;
  preferred_candidate?:HardwareCandidate|null;
  search_query:string;
  missing_evidence:string[];
  evidence:Record<string,unknown>;
  warning?:string|null;
};

async function jsonRequest<T>(url:string,token:string,init:RequestInit,timeoutMs:number):Promise<T>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...init,headers:{...(init.headers||{}),Authorization:`Bearer ${token}`},signal:controller.signal});
    let payload:any={};
    try{payload=await response.json()}catch{}
    if(!response.ok)throw new Error(payload?.detail||'RepairPilot request failed.');
    return payload as T;
  }catch(error:any){
    if(error?.name==='AbortError')throw new Error('RepairPilot timed out. Check your connection and try again.');
    throw error;
  }finally{clearTimeout(timer)}
}

export async function scanHardwarePhoto(options:{
  apiBase:string;
  token:string;
  uri:string;
  kind:HardwareKind;
  fileName?:string;
  mimeType?:string;
  timeoutMs?:number;
}):Promise<HardwareScanResult>{
  const {apiBase,token,uri,kind}=options;
  const form=new FormData();
  form.append('kind',kind);
  form.append('file',{
    uri,
    name:options.fileName||'repairpilot-hardware.jpg',
    type:options.mimeType||'image/jpeg'
  } as any);
  return jsonRequest<HardwareScanResult>(`${apiBase}/hardware/scan`,token,{method:'POST',body:form},options.timeoutMs??30000);
}

export async function fuseHardwareDepth(options:{
  apiBase:string;
  token:string;
  scan:HardwareScanResult;
  measurements:Partial<HardwareMeasurements>;
  confidence:number;
  source?:string;
  timeoutMs?:number;
}):Promise<HardwareScanResult>{
  return jsonRequest<HardwareScanResult>(`${options.apiBase}/hardware/fuse-depth`,options.token,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      scan:options.scan,
      measurements:options.measurements,
      confidence:options.confidence,
      source:options.source||'arkit_lidar'
    })
  },options.timeoutMs??15000);
}

export async function fuseHardwareThread(options:{
  apiBase:string;
  token:string;
  scan:HardwareScanResult;
  crestPositionsPx:number[];
  mmPerPixel:number;
  timeoutMs?:number;
}):Promise<HardwareScanResult>{
  return jsonRequest<HardwareScanResult>(`${options.apiBase}/hardware/fuse-thread`,options.token,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      scan:options.scan,
      crest_positions_px:options.crestPositionsPx,
      mm_per_pixel:options.mmPerPixel
    })
  },options.timeoutMs??15000);
}

export async function planHardwareReplacement(options:{
  apiBase:string;
  token:string;
  scan:HardwareScanResult;
  timeoutMs?:number;
}):Promise<HardwareReplacementPlan>{
  return jsonRequest<HardwareReplacementPlan>(`${options.apiBase}/hardware/replacement-plan`,options.token,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({scan:options.scan})
  },options.timeoutMs??15000);
}
