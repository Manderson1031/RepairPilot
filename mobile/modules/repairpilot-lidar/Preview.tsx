import React,{forwardRef} from 'react';
import {ViewProps} from 'react-native';
import {requireNativeViewManager} from 'expo-modules-core';

export type RepairPilotLidarPreviewRef={
  pause:()=>Promise<void>;
  resume:()=>Promise<void>;
};

type Props=ViewProps;
const NativePreview=requireNativeViewManager('RepairPilotLidarPreview') as React.ComponentType<Props&{ref?:React.Ref<RepairPilotLidarPreviewRef>}>;

const RepairPilotLidarPreview=forwardRef<RepairPilotLidarPreviewRef,Props>((props,ref)=><NativePreview {...props} ref={ref}/>);
RepairPilotLidarPreview.displayName='RepairPilotLidarPreview';
export default RepairPilotLidarPreview;
