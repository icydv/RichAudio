// Preparation limits may fall back to the existing immediate constructor.
// Invalid source data is a different error and must remain fatal.
export class SourcePreparationBudgetError10 extends Error {
 constructor(kind,maximum){
  const messages={banks:'prepared bank count budget exceeded',bytes:'prepared source memory budget exceeded',frames:'bounded prepared source length exceeded',intervals:'bounded prepared source interval count exceeded'};
  super(messages[kind]??'source preparation budget exceeded');this.name='SourcePreparationBudgetError10';this.kind=kind;this.maximum=maximum;
 }
}
