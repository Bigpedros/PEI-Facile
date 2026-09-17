/**
 * @license
 * PEI FACILE — Dev Geometry Calibration Tool Wrapper (Phase 1D)
 * Re-exports and wraps TemplateCalibrationWorkspace for backwards compatibility.
 */

import React from 'react';
import {
  TemplateCalibrationWorkspace,
  type TemplateCalibrationWorkspaceProps,
} from '../components/calibration/TemplateCalibrationWorkspace';

export const GeometryCalibrationTool: React.FC<TemplateCalibrationWorkspaceProps> = (props) => {
  return <TemplateCalibrationWorkspace {...props} />;
};
