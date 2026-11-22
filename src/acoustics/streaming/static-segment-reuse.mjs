import {querySegments} from '../research/local-geometry.mjs';

const maximumLegs=1024;
function copyAnswer(answer){
  return {...answer,surfaceTests:0,hits:answer.hits.map(hit=>({...hit,point:[...hit.point]})),
    unknown:[...answer.unknown],ambiguous:[...answer.ambiguous]};
}

// One preceding CPU batch only. Each answer belongs to an immutable tile
// and to both exact world-space endpoints, including their direction.
export class StaticSegmentReuse {
  #tile=null;
  #ends=new Float64Array(maximumLegs*6);
  #answers=[];
  reused=0;

  query(tile,segments){
    if(!segments.length||segments.length>maximumLegs){
      this.clear();
      return querySegments(tile,segments);
    }
    const first=this.#tile!==tile;
    if(first){this.#answers.length=0;this.#tile=tile;}
    const answers=new Array(segments.length),missing=[],indices=[],retain=[];
    for(let i=0;i<segments.length;i++){
      const {a,b}=segments[i],offset=i*6;
      const prior=i<this.#answers.length&&!first&&Array.isArray(a)&&a.length===3&&Array.isArray(b)&&b.length===3&&
        Object.is(a[0],this.#ends[offset])&&Object.is(a[1],this.#ends[offset+1])&&Object.is(a[2],this.#ends[offset+2])&&
        Object.is(b[0],this.#ends[offset+3])&&Object.is(b[1],this.#ends[offset+4])&&Object.is(b[2],this.#ends[offset+5]);
      if(prior&&this.#answers[i]){
        answers[i]=copyAnswer(this.#answers[i]);
        this.reused++;
      }else{
        indices.push(i);
        missing.push(segments[i]);
        // A moving leg has no use for a copied result until it stops.
        retain.push(first||prior);
      }
    }
    const fresh=querySegments(tile,missing);
    for(let j=0;j<missing.length;j++){
      const i=indices[j],{a,b}=missing[j],q=answers[i]=fresh[j];
      this.#ends.set(a,i*6);
      this.#ends.set(b,i*6+3);
      this.#answers[i]=retain[j]&&q.hits.length+q.unknown.length+q.ambiguous.length<=32?copyAnswer(q):null;
    }
    this.#answers.length=segments.length;
    return answers;
  }
  clear(){this.#tile=null;this.#answers.length=0;}
}
