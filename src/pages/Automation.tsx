import React from 'react';
import { PipelineCenter } from './PipelineCenter';

/**
 * Automation page — Jenkins-style CI/CD pipeline center.
 * (Replaces the legacy WHEN → IF → THEN rule hub; the rule/task composer
 * remains available under Scheduled Tasks.)
 */
const Automation: React.FC = () => <PipelineCenter />;

export default Automation;
export { Automation };