export async function viewReminder(frame,row){
  await row.getByRole('button',{name:/^(待查看|已查看)$/}).click();
  await frame.locator('.source-task-view').getByRole('button',{name:'关闭',exact:true}).click();
  await row.getByRole('button',{name:'已查看',exact:true}).waitFor();
}
export async function closeReminder(frame,row){
  if(await row.getByRole('button',{name:'待提醒',exact:true}).count()){
    await row.getByRole('button',{name:'待提醒',exact:true}).click();
    await row.getByRole('button',{name:'持续提醒',exact:true}).waitFor();
  }
  if(await row.getByRole('button',{name:'持续提醒',exact:true}).count()){
    await row.getByRole('button',{name:'持续提醒',exact:true}).click();
    await row.getByRole('button',{name:'关闭提醒',exact:true}).waitFor();
  }
  await row.getByRole('button',{name:'关闭提醒',exact:true}).click();
  if(await frame.locator('.source-task-view').count()){
    const price=frame.locator('.source-task-view');await price.getByRole('button',{name:'重新读取这款商品',exact:true}).click();await price.getByRole('button',{name:'确认处理并关闭提醒',exact:true}).waitFor();await price.locator('.source-task-action-result').filter({hasText:'单品价格核验通过'}).waitFor();await price.getByRole('button',{name:'确认处理并关闭提醒',exact:true}).click();await frame.locator('.source-price-close-confirm').getByRole('button',{name:'是，确认关闭',exact:true}).click();
  }else await frame.locator('.source-reminder-close').getByRole('button',{name:'是',exact:true}).click();
  await row.getByRole('button',{name:'已关闭 · 待刷新',exact:true}).waitFor();
}
