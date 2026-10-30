// Authored device-free source-state study. No claim of Rockstar's RPM law.
export const npcComparisonSeconds=4.1;
export function npcOperating(t){
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const rise=smooth((t-.8)/1.2),fall=smooth((t-2.8)/.6);
 return {operatingPoint:(.06+.79*rise)*(1-fall)+.06*fall,load:t<2.8?.9:.05,lift:t>=2.8,running:true};
}
