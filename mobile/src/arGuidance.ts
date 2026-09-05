import {Platform} from 'react-native';
import RepairPilotAR from '../modules/repairpilot-ar';

export type ARPoint={x:number;y:number};
export type ARAnchorPlacement={id:string;confidence?:number;position:{x:number;y:number;z:number}};
export type ARProjectedAnchor={visible:boolean;x:number;y:number;depth:number};
export type ARSnapshot={imageUri:string;imageBase64:string;mimeType:string;width:number;height:number;depthAvailable:boolean};

export async function arAvailability():Promise<{available:boolean;depthAvailable:boolean;reason?:string}>{
  if(Platform.OS!=='ios')return {available:false,depthAvailable:false,reason:'Native spatial guidance is currently supported on iOS.'};
  if(!RepairPilotAR)return {available:false,depthAvailable:false,reason:'This build does not include the RepairPilot AR native module.'};
  try{
    const supported=await RepairPilotAR.isSupported();
    if(!supported)return {available:false,depthAvailable:false,reason:'ARKit world tracking is not supported on this device.'};
    const depthAvailable=await RepairPilotAR.isDepthSupported();
    return {
      available:true,
      depthAvailable,
      reason:depthAvailable?'ARKit world tracking and scene-depth anchoring are available.':'ARKit world tracking is available, but scene-depth anchoring is not supported on this device.'
    };
  }catch{
    return {available:false,depthAvailable:false,reason:'AR capability could not be verified on this device.'};
  }
}

export async function startARSession():Promise<{depthAvailable:boolean}>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  const result=await RepairPilotAR.startSession();
  return {depthAvailable:!!result?.depth};
}

export async function stopARSession():Promise<void>{ if(RepairPilotAR)await RepairPilotAR.stopSession(); }

function snapshotResult(snapshot:any):ARSnapshot{
  const mimeType=snapshot?.mime_type||'image/jpeg';
  const imageBase64=snapshot?.image_base64||'';
  return {
    imageUri:`data:${mimeType};base64,${imageBase64}`,
    imageBase64,
    mimeType,
    width:Number(snapshot?.width)||0,
    height:Number(snapshot?.height)||0,
    depthAvailable:!!snapshot?.depth_available,
  };
}

export async function captureARTargetSnapshot():Promise<ARSnapshot>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  return snapshotResult(await RepairPilotAR.captureTargetSnapshot());
}
export async function captureARLiveSnapshot():Promise<ARSnapshot>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  return snapshotResult(await RepairPilotAR.captureLiveSnapshot());
}
export async function placeDepthARAnchor(point:ARPoint):Promise<ARAnchorPlacement>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  return RepairPilotAR.anchorAtFrozenDepthPoint(point);
}
export async function placeARAnchor(point:ARPoint,depthMeters:number):Promise<ARAnchorPlacement>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  if(!Number.isFinite(depthMeters)||depthMeters<=0)throw new Error('A trusted positive depth is required to anchor guidance to the equipment.');
  return RepairPilotAR.anchorAtImagePoint(point,depthMeters);
}
export async function projectARAnchor(id:string,width:number,height:number):Promise<ARProjectedAnchor>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  return RepairPilotAR.projectAnchor(id,{width,height});
}
export async function removeARAnchor(id:string):Promise<void>{ if(RepairPilotAR)await RepairPilotAR.removeAnchor(id); }
export async function clearARAnchors():Promise<void>{ if(RepairPilotAR)await RepairPilotAR.clearAnchors(); }
