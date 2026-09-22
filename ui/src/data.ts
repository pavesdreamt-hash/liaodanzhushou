export type OrderRow = {
  id: string;
  date: string;
  time: string;
  orderNo: string;
  phone: string;
  name: string;
  product: string;
  amount: string;
  source: string;
  status: '待确认'|'运输中'|'已签收'|'草稿'|'已作废';
  updated: string;
};

export type ProductRow = {
  id: string;
  name: string;
  price: number;
  cost: number;
  suggested: number;
  inStock: boolean;
  color: string;
};

export const demoOrders: OrderRow[] = [
  {id:'1',date:'2026-09-20',time:'14:26',orderNo:'M202609200031',phone:'+971 50 000 0002',name:'Avery',product:'KY02 × 2',amount:'AED 150',source:'聊单创建',status:'待确认',updated:'今天 14:38'},
  {id:'2',date:'2026-09-20',time:'11:08',orderNo:'SP-90482117',phone:'+971 55 238 1020',name:'Omar',product:'KY03 × 1',amount:'AED 120',source:'文件导入',status:'运输中',updated:'今天 13:12'},
  {id:'3',date:'2026-09-19',time:'18:42',orderNo:'SP-90481762',phone:'+971 52 440 8011',name:'Mia',product:'AB12 × 4',amount:'AED 240',source:'文件导入',status:'已签收',updated:'今天 11:26'},
  {id:'4',date:'2026-09-19',time:'16:15',orderNo:'M202609190030',phone:'+971 56 880 2210',name:'姓名未确认',product:'尚未选择',amount:'—',source:'手动新增',status:'草稿',updated:'昨天 18:40'},
  {id:'5',date:'2026-09-18',time:'09:30',orderNo:'SP-90479902',phone:'+971 50 771 6632',name:'Noah',product:'LM01 × 2',amount:'AED 190',source:'文件导入',status:'已作废',updated:'昨天 16:08'},
  ...Array.from({length:19},(_,index)=>{
    const number=index+6;
    const statuses:OrderRow['status'][]=['待确认','运输中','已签收','草稿'];
    const products=['KY02 × 1','KY03 × 2','AB12 × 2','LM01 × 1','PK01 × 3'];
    const names=['Layla','Zayed','Mariam','Hassan','Salma','Yousef'];
    const status=statuses[index%statuses.length];
    return {id:String(number),date:`2026-09-${String(18-Math.floor(index/4)).padStart(2,'0')}`,time:`${String(8+index%9).padStart(2,'0')}:${String((index*7)%60).padStart(2,'0')}`,orderNo:`SP-904${79880-index}`,phone:`+971 5${index%7} ${String(3100000+index*1379).replace(/(\d{3})(\d{4})/,'$1 $2')}`,name:names[index%names.length],product:products[index%products.length],amount:`AED ${[75,240,120,95,90][index%5]}`,source:index%5===0?'聊单创建':'文件导入',status,updated:`09-${String(18-Math.floor(index/4)).padStart(2,'0')} ${String(9+index%8).padStart(2,'0')}:20`} as OrderRow;
  })
];

export const demoProducts: ProductRow[] = [
  {id:'KY02',name:'KY02',price:75,cost:42,suggested:78,inStock:false,color:'#f1e8ff'},
  {id:'KY03',name:'KY03',price:120,cost:66,suggested:125,inStock:true,color:'#e4f6f1'},
  {id:'AB12',name:'AB12',price:60,cost:31,suggested:65,inStock:true,color:'#fff0e2'},
  {id:'KY02-B',name:'KY02 蓝色',price:78,cost:43,suggested:80,inStock:true,color:'#e6ebff'},
  {id:'LM01',name:'LM01',price:95,cost:52,suggested:100,inStock:false,color:'#fff4d8'},
  {id:'PK01',name:'PK01',price:30,cost:16,suggested:35,inStock:true,color:'#f9e6f0'},
  {id:'RM08',name:'RM08',price:110,cost:59,suggested:115,inStock:true,color:'#e8f4ff'},
  {id:'AX15',name:'AX15',price:88,cost:47,suggested:92,inStock:false,color:'#f7e8ee'}
];

export const demoTasks = [
  ['A','+971 50 000 0002','Avery Example · 新消息','Okay, please deliver them to Dubai.','待回复'],
  ['N','+971 50 000 0104','Noor Ali · 资料不完整','Can I pay when it arrives?','待补收货资料'],
  ['S','+971 50 000 0285','Samuel K · 等待客户确认','Please confirm the final price.','待确认商品与价格'],
  ['M','+971 50 000 0538','Mohammed · 新消息','Do you have another color?','待回复'],
  ['R','+971 50 000 0671','Rashid · 缺少联系电话','The villa number is 18.','待补联系电话'],
  ['F','+971 50 000 0422','Fatima · 今日回访','客户暂未决定配送时间。','待回访'],
  ['L','+971 52 330 1880','Layla · 新消息','Is KY03 available today?','待回复'],
  ['Y','+971 55 790 4021','Yousef · 等待确认','Please send the final total.','待确认价格'],
  ['?','+971 56 410 2838','姓名未确认 · 新会话','Hello, I saw this product online.','待补客户资料'],
  ['H','+971 54 665 0917','Hassan · 配送待核对','Near Mall of the Emirates.','待核对地址'],
  ['S','+971 50 824 1160','Salma · 今日回访','I will confirm this afternoon.','待回访'],
  ['Z','+971 58 382 7054','Zayed · 价格待确认','Can you offer a discount?','需要人工']
];

export const profitRows = [
  {day:'09-20',received:'¥2,380',ad:'$260',adCny:'≈ ¥1,846',account:'¥0',shipping:'AED 115',shippingCny:'≈ ¥207',cost:'¥2,053',profit:'¥327',value:327},
  {day:'09-19',received:'¥2,180',ad:'$210',adCny:'≈ ¥1,491',account:'¥200',shipping:'AED 86',shippingCny:'≈ ¥155',cost:'¥1,846',profit:'¥334',value:334},
  {day:'09-18',received:'¥2,960',ad:'$300',adCny:'≈ ¥2,130',account:'¥0',shipping:'AED 136',shippingCny:'≈ ¥245',cost:'¥2,375',profit:'¥585',value:585},
  {day:'09-17',received:'¥1,680',ad:'$190',adCny:'≈ ¥1,349',account:'¥0',shipping:'AED 72',shippingCny:'≈ ¥130',cost:'¥1,479',profit:'¥201',value:201},
  {day:'09-16',received:'¥2,360',ad:'$235',adCny:'≈ ¥1,669',account:'¥120',shipping:'AED 94',shippingCny:'≈ ¥169',cost:'¥1,958',profit:'¥402',value:402},
  {day:'09-15',received:'¥1,920',ad:'$205',adCny:'≈ ¥1,456',account:'¥0',shipping:'AED 81',shippingCny:'≈ ¥146',cost:'¥1,602',profit:'¥318',value:318},
  {day:'09-14',received:'¥2,740',ad:'$275',adCny:'≈ ¥1,953',account:'¥0',shipping:'AED 118',shippingCny:'≈ ¥212',cost:'¥2,165',profit:'¥575',value:575}
];
