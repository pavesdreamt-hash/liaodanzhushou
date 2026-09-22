export const RECIPIENT_FIELDS=Object.freeze([
  {field:'lastName',column:'customer_last_name',label:'Surname'},
  {field:'firstName',column:'customer_first_name',label:'Name'},
  {field:'phone',column:'customer_phone',label:'Telephone'},
  {field:'email',column:'customer_email',label:'Email'},
  {field:'country',column:'country',label:'Country/Region'},
  {field:'province',column:'province',label:'Province'},
  {field:'city',column:'city',label:'City'},
  {field:'street',column:'street',label:'Street'},
  {field:'residence',column:'residence',label:'Residence'}
]);
export const RECIPIENT_FIELD_NAMES=new Set(RECIPIENT_FIELDS.map(value=>value.field));
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';

export function recipientDetails(order,overrides=[]){
  const byField=new Map(overrides.map(value=>[value.field_name,value]));
  const fields=RECIPIENT_FIELDS.map(definition=>{const override=byField.get(definition.field),original=(order.draft_request_id&&definition.field==='firstName'?order.customer_full_name:order[definition.column])??null,effective=override?.override_value??original;return {...definition,original,effective,overrideValue:override?.override_value??null,overridden:Boolean(override),overrideKind:override?.override_kind??null,reason:override?.reason??null,updatedAt:override?.updated_at??null};});
  const firstName=fields.find(value=>value.field==='firstName');return {fields,fullName:order.customer_full_name??null,canConfirmFullNameAsName:!present(firstName.effective)&&present(order.customer_full_name)};
}

export function effectiveRecipientOrder(order,overrides=[]){const detail=recipientDetails(order,overrides),result={...order};for(const field of detail.fields)result[field.column]=field.effective;if(order.draft_request_id)result.customer_full_name=result.customer_first_name;return result;}
