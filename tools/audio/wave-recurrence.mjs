// Original offline measurement: infer periods from samples, never scheduler IDs.
export function lagComparison(data,lag,trim=4800){
  if(!(data instanceof Float64Array)||data.length>720000||!Number.isSafeInteger(trim)||trim<0||!Number.isSafeInteger(lag)||lag<1||lag>=data.length-2*trim)throw Error('wave comparison bounds');
  let different=0,square=0,ab=0,aa=0,bb=0,count=0;
  for(let n=trim;n+lag<data.length-trim;n++){
    const a=data[n],b=data[n+lag];if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('nonfinite wave');
    const d=a-b;if(d!==0)different++;square+=d*d;ab+=a*b;aa+=a*a;bb+=b*b;count++;
  }
  return {lagFrames:lag,comparedSamples:count,differentSamples:different,rmsDifference:Math.sqrt(square/count),normalisedCorrelation:aa*bb>0?ab/Math.sqrt(aa*bb):null};
}
export function exactWavePeriods(data,{trim=4800,maxLag=96000,anchorLength=1024,maxAnchors=128}={}){
  if(!(data instanceof Float64Array)||data.length>720000||!Number.isSafeInteger(trim)||trim<0||!Number.isSafeInteger(maxLag)||maxLag<1||maxLag>Math.floor((data.length-2*trim)/2)||!Number.isSafeInteger(anchorLength)||anchorLength<8||anchorLength>4096||trim+maxLag+anchorLength>data.length-trim||!Number.isSafeInteger(maxAnchors)||maxAnchors<1||maxAnchors>1024)throw Error('recurrence search bounds');
  if(data.some(v=>!Number.isFinite(v)))throw Error('nonfinite wave');
  // KMP scans every lag's anchor in linear time; every global exact period must
  // pass this necessary test. Full interior verification rejects local repeats.
  const pattern=data.subarray(trim,trim+anchorLength),prefix=new Int32Array(anchorLength);
  for(let i=1,j=0;i<anchorLength;i++){while(j&&pattern[i]!==pattern[j])j=prefix[j-1];if(pattern[i]===pattern[j])j++;prefix[i]=j;}
  const periods=[];let matches=0,limited=false;
  for(let i=trim+1,j=0;i<trim+maxLag+anchorLength;i++){
    while(j&&data[i]!==pattern[j])j=prefix[j-1];if(data[i]===pattern[j])j++;
    if(j===anchorLength){const lag=i-anchorLength+1-trim;j=prefix[j-1];if(lag>maxLag)break;
      if(++matches>maxAnchors){limited=true;break;}
      const result=lagComparison(data,lag,trim);if(result.differentSamples===0)periods.push(result);
    }
  }
  return {trimFrames:trim,maxLagFrames:maxLag,anchorLength,anchorMatches:Math.min(matches,maxAnchors),limited,exactPeriods:periods};
}
