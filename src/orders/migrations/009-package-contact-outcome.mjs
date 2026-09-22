export const migration009=Object.freeze({
  version:9,
  name:'package_contact_outcome',
  statements:[
    `ALTER TABLE packages ADD COLUMN contact_outcome TEXT CHECK (contact_outcome IS NULL OR contact_outcome='unreachable')`
  ]
});
