import {Platform} from 'react-native';
import RepairPilotAR from '../modules/repairpilot-ar';

export type ARPoint={x:number;y:number};
export type ARAnchorPlacement={id:string;position:{x:number;y:number;z:number}};
export type ARProjectedAnchor={visible:boolean;x:number;y:number;depth:number};

export async function arAvailability():Promise<{available:boolean;reason?:string}>{
  if(Platform.OS!=='ios')return {available:false,reason:'Native spatial guidance is currently supported on iOS.'};
  if(!RepairPilotAR)return {available:false,reason:'This build does not include the RepairPilot AR native module.'};
  try{
    return await RepairPilotAR.isSupported()?{available:true}:{available:false,reason:'ARKit world tracking is not supported on this device.'};
  }catch{
    return {available:false,reason:'AR capability could not be verified on this device.'};
  }
}

export async function startARSession():Promise<void>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  await RepairPilotAR.startSession();
}

export async function stopARSession():Promise<void>{
  if(RepairPilotAR)await RepairPilotAR.stopSession();
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

export async function removeARAnchor(id:string):Promise<void>{
  if(!RepairPilotAR)throw new Error('RepairPilot AR is unavailable in this build.');
  await RepairPilotAR.removeAnchor(id);
}

export async function clearARAnchors():Promise<void>{
  if(RepairPilotAR)await RepairPilotAR.clearAnchors();
}
