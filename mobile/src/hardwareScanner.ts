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
};

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
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),options.timeoutMs??30000);
  try{
    const form=new FormData();
    form.append('kind',kind);
    form.append('file',{
      uri,
      name:options.fileName||'repairpilot-hardware.jpg',
      type:options.mimeType||'image/jpeg'
    } as any);
    const response=await fetch(`${apiBase}/hardware/scan`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`},
      body:form,
      signal:controller.signal
    });
    let payload:any={};
    try{payload=await response.json()}catch{}
    if(!response.ok)throw new Error(payload?.detail||'Hardware scan failed.');
    return payload as HardwareScanResult;
  }catch(error:any){
    if(error?.name==='AbortError')throw new Error('Hardware scan timed out. Check your connection and try again.');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
