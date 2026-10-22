// Mapping needs only local source decisions and catalogue metadata. Do not load
// the inventory dashboard, images, or generate unrelated source-change reports.
export async function readMappingWorkspace({orchestrator,store,catalog,renameService,localOnly=false}){
  const [mapping,website,renames,document]=await Promise.all([
    orchestrator.mappingStatus({localOnly}),
    catalog.getMappingView({includeReconciliation:!localOnly}),
    renameService.options(),store.read()
  ]);
  if(mapping.mapping)mapping.mapping.retired=(document.sourceRelationHistory||[]).filter(r=>!r.reappearedAt).map(r=>({...r,inactive:true}));
  return{mapping,catalog:website,renames};
}
