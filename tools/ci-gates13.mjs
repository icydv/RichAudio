// Required validation is fail-closed; baseline timing is evidence, not a
// requirement that a deliberately slower parent must satisfy the new gate.
export const blockBudget13=512000/48000,headroomBudget13=8;
export function processingVerdict13(summary){
 const experiments=Array.isArray(summary?.experiments)?summary.experiments:[];
 const groups=experiments.flatMap(e=>Array.isArray(e.groups)?e.groups.filter(g=>g.implementation==='candidate'):[]);
 const coverageComplete=experiments.length===2&&experiments.every(e=>e.completed===true&&e.terminalFailure===null&&Number.isInteger(e.requestedTrials)&&e.requestedTrials>0&&e.trials===e.requestedTrials&&Array.isArray(e.groups)&&e.groups.some(g=>g.implementation==='candidate'))&&groups.every(g=>Number.isInteger(g.blocks)&&g.blocks>0&&g.all?.calls===g.blocks&&Number.isFinite(g.all.maximumMs)&&g.all.maximumMs>=0&&Number.isInteger(g.all.overBudget)&&g.all.overBudget>=0&&g.all.overBudget<=g.blocks&&Number.isInteger(g.postAnalysisHeadroom?.blocksAboveTarget)&&g.postAnalysisHeadroom.blocksAboveTarget>=g.all.overBudget&&g.postAnalysisHeadroom.blocksAboveTarget<=g.blocks);
 const functionalPassed=coverageComplete&&summary.functionalPassed===true&&summary.pcmPassed===true&&experiments.every(e=>e.gates?.functional===true&&e.gates?.pcm===true);
 const hardDeadlinePassed=coverageComplete&&summary.blockBudgetMs===blockBudget13&&groups.every(g=>g.all.blockBudgetMs===blockBudget13&&g.all.overBudget===0&&g.all.maximumMs<=blockBudget13);
 const headroomPassed=coverageComplete&&groups.every(g=>g.postAnalysisHeadroom?.targetMs===headroomBudget13&&g.postAnalysisHeadroom.blocksAboveTarget===0&&g.postAnalysisHeadroom.maximumTargetMet===true&&g.all.maximumMs<=headroomBudget13);
 return {kind:'World13RequiredProcessingVerdict',coverageComplete,functionalPassed,hardDeadlinePassed,headroomPassed,requiredPassed:functionalPassed&&hardDeadlinePassed&&headroomPassed,candidateBlocks:groups.reduce((n,g)=>n+(g.blocks??0),0),candidateMisses:groups.reduce((n,g)=>n+(g.all?.overBudget??0),0),candidateBlocksAboveHeadroom:groups.reduce((n,g)=>n+(g.postAnalysisHeadroom?.blocksAboveTarget??0),0),blockBudgetMs:blockBudget13,headroomTargetMs:headroomBudget13,parentTimingIsNotCandidateAcceptance:true,allSelectedCandidatePreparationsRequired:true};
}
export function requiredJobsVerdict13({functional=null,processing=null}={}){
 return {kind:'World13RequiredJobsVerdict',functional,processing,requiredPassed:functional==='success'&&processing==='success',missingOrUnexecuted:[['functional',functional],['processing',processing]].filter(([,v])=>v===null||v==='skipped'||v==='cancelled').map(([name])=>name)};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/ci-gates13.mjs')){
 const result=requiredJobsVerdict13({functional:process.env.WORLD13_FUNCTIONAL_RESULT??null,processing:process.env.WORLD13_PROCESSING_RESULT??null});console.log(JSON.stringify(result));if(!result.requiredPassed)process.exitCode=1;
}
