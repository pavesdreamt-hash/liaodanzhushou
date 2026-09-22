const values=(record,columns)=>columns.map(column=>record[column]??null);

export class FinancialRuleRepository {
  constructor(database){this.database=database;}
  activeFeeRuleSet(at=new Date().toISOString()){
    return this.database.prepare('SELECT * FROM fee_rule_sets WHERE is_enabled=1 AND effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1').get(at)||null;
  }
  feeRuleSet(id){return this.database.prepare('SELECT * FROM fee_rule_sets WHERE id=?').get(id)||null;}
  feeRule({ruleSetId,zone,status,includeDisabled=false}){
    if(zone==='unclassified'&&!status.startsWith('cancelled_'))return null;
    return this.database.prepare(`SELECT * FROM fee_rules WHERE rule_set_id=? AND package_status=? AND delivery_zone IN (?, 'any')${includeDisabled?'':' AND is_enabled=1'}
      ORDER BY CASE WHEN delivery_zone=? THEN 0 ELSE 1 END LIMIT 1`).get(ruleSetId,status,zone,zone)||null;
  }
  activeExchangeRate(at=new Date().toISOString()){
    return this.database.prepare("SELECT * FROM exchange_rate_rules WHERE currency_pair='AED/CNY' AND is_enabled=1 AND effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1").get(at)||null;
  }
  createFeeRuleSet(ruleSet,rules){
    const columns=['id','version','effective_from','is_enabled','created_at','fee_mode'];this.database.exec('BEGIN IMMEDIATE');
    try{
      this.database.prepare(`INSERT INTO fee_rule_sets(${columns.join(',')}) VALUES(?,?,?,?,?,?)`).run(...values({...ruleSet,fee_mode:ruleSet.fee_mode||'fixed_rules'},columns));
      const statement=this.database.prepare('INSERT INTO fee_rules(id,rule_set_id,delivery_zone,package_status,delivery_fee,handling_fee,total_fee,is_enabled,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
      for(const rule of rules)statement.run(rule.id,ruleSet.id,rule.delivery_zone,rule.package_status,rule.delivery_fee,rule.handling_fee,rule.total_fee,rule.is_enabled??1,rule.created_at||ruleSet.created_at);
      this.database.exec('COMMIT');return this.feeRuleSet(ruleSet.id);
    }catch(error){this.database.exec('ROLLBACK');throw error;}
  }
  createExchangeRate(rule){
    this.database.prepare('INSERT INTO exchange_rate_rules(id,version,currency_pair,rate_scaled,scale,effective_from,is_enabled,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(rule.id,rule.version,rule.currency_pair||'AED/CNY',rule.rate_scaled,rule.scale,rule.effective_from,rule.is_enabled??1,rule.created_at);
    return this.database.prepare('SELECT * FROM exchange_rate_rules WHERE id=?').get(rule.id);
  }
}

export function feeSnapshot(rule){
  if(!rule)return null;
  return {ruleId:rule.id,deliveryFeeFils:BigInt(rule.delivery_fee),handlingFeeFils:BigInt(rule.handling_fee),totalFeeFils:BigInt(rule.total_fee),finalized:true,overridden:false};
}

function roundedDivision(numerator,denominator){
  if(denominator<=0n)throw new RangeError('换算精度必须大于0');const negative=numerator<0n,absolute=negative?-numerator:numerator,result=(absolute+denominator/2n)/denominator;return negative?-result:result;
}

export function convertAedFilsToRmbFen(aedFils,{rate_scaled,scale}){return roundedDivision(BigInt(aedFils)*BigInt(rate_scaled),BigInt(scale));}
