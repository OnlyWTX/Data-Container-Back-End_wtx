const cp = require('child_process');//引入包
const formidable = require('formidable');
const uuid=require('node-uuid')
const fs=require('fs')
const fsPromises = fs.promises;
const FormData=require('form-data') 
var path = require("path")
const { instances } = require('../model/instances')
const request=require('request')
const Request=require('request')

const utils=require('../utils/utils.js')
const xml2js =require('xml2js')
const convert=require('xml-js')
var parser = new xml2js.Parser();
const builder=new xml2js.Builder();
const cfg=require('../config/config.js')
const templateId=require('../lib/data/templateIdOfVisualSolution');
const XML = require('xml');
const compressing = require('compressing');
const transitUrl=cfg.transitUrl
const bindPcsUrl=cfg.bindPcsUrl
const processing_result=__dirname+'/../processing_result';
const tree=__dirname+'/../saga_tools/tree.json';
const tools_tree=__dirname+'/../saga_tools/tools_tree.json';

// const async = require('async')
// const axios = require('axios')

// const FileAPI = require('file-api')
//   , File = FileAPI.File

// const Blob = require('blob');
// const readBlob = require('read-blob');


exports.newProcessing=function(req,res,next){
    let script_uid=uuid.v4()
    let path=__dirname+'/../upload_processing/'+script_uid
    
    let mkdirPromise=fsPromises.mkdir(path)

    mkdirPromise.then((v)=>{

        var form =new formidable.IncomingForm()
        form.uploadDir=path
        form.keepExtensions=true
    
        form.parse(req,(err,fields,files)=>{
            
            if(err){
                res.send({code:-1,message:'new processing error!'})
                return
            }
            
            let query={
                uid:fields.uid,
                type:fields.instype,
                userToken:fields.userToken,
            }
            let newFile={
                id:fields.id,
                oid:fields.oid,
                name:fields.name,
                date:fields.date,
                type:fields.type,
                description:fields.description,
                authority:Boolean(fields.authority),
                paramsCount:fields.paramsCount,
                meta:fields.meta,
                fileList:fields.fileList.split(','),
                storagePath: form.uploadDir,
                relatedData:fields.relatedData.split(','),
            }
            if(fields.processingPath!=undefined){
                form.uploadDir = fields.processingPath;
                newFile.storagePath = fields.processingPath;
            }
            instances.findOne(query,(find_err,doc)=>{
                if(find_err){
                    res.send({code:-1,message:'db find error!'})
                    return
                }else{


                    let xmlFile=newFile.fileList[0].split('.')[1]=='xml'?newFile.fileList[0]:newFile.fileList[1]
                    let xmlPath=form.uploadDir+'/'+xmlFile
                    fs.readdir( form.uploadDir,(err,filesItem)=>{
                        filesItem.forEach(v=>{
                            newFile.fileList.forEach(v2=>{
                                if(v.split('.')[1]===v2.split('.')[1]){
                                    fs.renameSync(form.uploadDir+'/'+v,form.uploadDir+'/'+v2)
                                }
                            })
                        });
                        fs.readFile(xmlPath, function(err, data) {
                            parser.parseString(data, function (err, result) {
                                newFile['metaDetail']=JSON.stringify(result)
                                
                                
                                doc.list.unshift(newFile)
                                
                                instances.updateOne(query,doc,(update_err)=>{
                                    if(update_err){
                                        res.send({code:-1,message:'db update error!'})
                                        return
                                    }
                
                                    res.send({code:0,message:'create ok'})
                                        return
                
                                })





                            });
                        });//end  readFile
                    })
                }   
            })        
    
        })



    })
    
  

}

exports.delProcessing=function(req,res,next){

    instances.findOne({uid:req.query.uid,type:req.query.instType},(err,doc)=>{
        if(err||!doc){
            res.send({code:-1,message:"error"})
            return
        }else{

            for(let it of doc.list){
                if(it.id===req.query.id){
                    let i=doc.list.indexOf(it)
                    utils.delDir(it.storagePath)
                    doc.list.splice(i,1)
                    instances.updateOne({uid:req.query.uid,type:req.query.instType},doc,(err)=>{
                        if(err){
                            res.send({code:-1,message:"error"})
                            return
                        }else{

                            
                            res.send({code:0,data:{id:req.query.id}})
                            return
                        }
                    })
                    break

                }
            }
        }
    })

    

};

exports.bindProcessing=function(req,res,next){
    instances.findOne({'list.id':req.query.id},(err,doc)=>{

        doc
        let item
        for(let p of doc.list){
         if(p.id===req.query.id){
            item=p
            break;
         }     
        }
        
        let postData={
            'proName':item.name,
            'dataIds':item.relatedData.join(","),
            'proId':item.id,
            'proDescription':item.description,
            'token':req.query.token,
            'type':item.type
        }
        let form=new FormData()
        for(let it in postData){
            form.append(it,postData[it])
            
        }
        
        let xml_name=item.fileList[0].split('.')[1]==='xml'?item.fileList[0]:item.fileList[1]
        fs.readFile(item.storagePath+'/'+xml_name,(err,xmlContent)=>{
            // form.append('xml',xmlContent)
            postData['xml']=xmlContent

                let options = {
                    method : 'POST',
                    url : bindPcsUrl ,
                    headers : { 'Content-Type' : 'multipart/form-data' },
                    form : postData
                };
                request(options, function (error, response, body) {
                    if ( response.statusCode == 200) {
                        let re=JSON.parse(body)
                      if(re.code===0){
                        res.send({code:0,data:re.data})
                        return
                      }else if(re.code===-2){
                        res.send({code:-2,data:re.data})
                        return
                      }else if(re.code===-1){
                        res.send({code:-1,data:re.message})
                        return
                      }
                    }else {
                        res.send({code:-1,data:'error'})
                        return
                    }
                  });  
        })
    })
}

exports.executePrcs=function(req,res,next){
    
    instances.findOne({'list.id':req.query.pcsId},(err,doc)=>{
        if(err||!doc){
            res.send({code:-1,message:'find error'})
            return
        }
        let pcs_item
        for (const it of doc.list) {
            if(it.id===req.query.pcsId){
                pcs_item=it
                break
            }
        }
        let pythonPath=pcs_item.fileList[0].split('.')[1]==="py"?pcs_item.fileList[0]:pcs_item.fileList[1]
        let py_script_path=pcs_item.storagePath+'/'+pythonPath//python脚本路径

        instances.findOne({'list.id':req.query.dataId},(err,data_doc)=>{
            if(err||!data_doc){
                res.send({code:-1,message:'find error'})
                return
            }
            let data_item
            for (const it of data_doc.list) {
                if(it.id===req.query.dataId){
                    data_item=it
                    break
                }
            }

            let input=data_item.meta.currentPath
            input=path.normalize(input)
            let forward=input.replace(/\\/g,'%5C')
            input=forward.replace(/%5C/g,'/')

            let pcs_re=uuid.v4()
            let output=processing_result+'/'+pcs_re
            let mkdirPromise=fsPromises.mkdir(output)
            output=path.normalize(output)
             forward=output.replace(/\\/g,'%5C')
            output=forward.replace(/%5C/g,'/')

            mkdirPromise.then((v)=>{
                let par= [ py_script_path,input,output]
                //将参数数组填入
                if(req.query.params!=undefined&&req.query.params!=''){
                    let r=req.query.params.split(',')
                    r.forEach(v=>{
                        par.push(v)
                    })
                }
                let pcs_stout=undefined
                const ls = cp.spawn(cfg.pythonExePath, par);//python安装路径，python脚本路径，shp路径，照片结果路径
                ls.on('error',(err)=>{
                    console.log(`错误 ${err}`);
                    res.send({code:-2,message:(err).toString()});
                    return;
                })
                ls.on('close', (code) => {//exit之后
                    console.log(`子进程close，退出码 ${code}`);
                    

                  });
                ls.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                    pcs_stout=data
                                        
                })
                
                ls.on('exit', (code) => {
                    console.log(`子进程使用代码 ${code} 退出`);
                    if(code!=0){
                        let msg={code:-2,message:'processing methods error'}
                        res.send(msg);
                        return
                    }
                    fs.readdir(output,(err,f_item)=>{

                        if(f_item.length==0){
                            let msg={code:-2,message:'processing methods error'}
                            if( pcs_stout!=undefined){
                                msg.message=pcs_stout.toString('utf-8')
                            }
                            res.send(msg);
                            return
                        }
                        let bk_html=undefined
                        for(let f of f_item){
                            if(f.split('.')[1]=='html'&&doc.type=='Visualization'){
                                bk_html=true;
                                break
                            }
                        }
                       
                        let upObj={
                            'name':req.query.token,
                            'userId':req.query.token,
                            'origination':'distributedContainer',
                            'serverNode':'china',
                            'ogmsdata':[]        
                        }
                        f_item.forEach(v=>{
                            upObj['ogmsdata'].push(fs.createReadStream(output+'/'+v))
                        })
                        let dataType=undefined
                        f_item.forEach(v=>{
                            if(v.split(".")[1]==="shp"){
                                dataType='shp'
                            }else if(v.split(".")[1]==="tif"||v.split(".")[1]==="tiff"){
                                dataType='tiff'
                            }

                        })
                        //拼接配置文件
                        let udxcfg=cfg.configUdxCfg[0]+'\n'+cfg.configUdxCfg[1]+'\n'
                        for(let i=0;i<f_item.length;i++){
                            udxcfg+=cfg.configUdxCfg[2]+'\n'
                        }
                        udxcfg+=cfg.configUdxCfg[3]+'\n'
                        udxcfg+=cfg.configUdxCfg[4]+'\n'
                        if(dataType==="shp"){
                            udxcfg+=templateId.shp[0]
                        }else if(dataType=="tiff"){
                            udxcfg+=templateId.tiff[0]
                        }else{
                            udxcfg+=templateId.shp[0]
                        }
                        udxcfg+=cfg.configUdxCfg[5]+'\n'
                        udxcfg+=cfg.configUdxCfg[6]+'\n'



                        fs.writeFileSync(output+'/config.udxcfg',udxcfg)

                        upObj['ogmsdata'].push(fs.createReadStream(output+'/config.udxcfg')) 

                        
                        let options = {
                            method : 'POST',
                            url : transitUrl+'/data',
                            headers : { 'Content-Type' : 'multipart/form-data' },
                            formData : upObj
                        };
                        //调用数据容器上传接口
                        let promise= new Promise((resolve, reject) => {
                            let readStream = Request(options, (error, response, body) => {
                                if (!error) {
                                    
                                    resolve({response, body})
                                } else {
                                    reject(error);
                                }
                            });
                        });
                        //返回数据下载id
                        promise.then(function(v){
                            //删除配置文件
                            fs.unlinkSync(output+'/config.udxcfg',udxcfg)
                            let r=JSON.parse(v.body)
                            if(r.code==-1){
                                res.send({code:-2,message:v.msg});
                                return
                            }else{
                                console.log('insitu content data ',req.query.dataId,'process method',req.query.pcsId)
                               let rs={code:0,uid:r.data.source_store_id,stout:pcs_stout!=undefined?pcs_stout.toString('utf-8'):undefined}
                               if(bk_html){
                                    rs['html']=true
                               }
                                res.send(rs)
                                return
                            }
                          
                        },(rej_err)=>{
                            console.log(rej_err)
                        })
                        


                    })
                 

                });
                
            
            })
        })
    })
}

exports.chsdtne=function(req,res,next){


    let ids=req.query.dtNae.split(',')
    let ps=[]
    for(let id of ids){
        let promse=instances.findOne({'list.id':id}).exec()
        ps.push(promse)
        
    }
    let re={}
    const p=Promise.all(ps);//全部茶道结果后返回
    p.then(docs=>{
             
            for(let ths_id of ids){
                for(let doc_item of docs){
                     
                        for(let d of doc_item.list){
                            if(d.id==ths_id){
                                re[d.id]=d.name
                            }
                        }
                    
                }
            }
         
        

      res.send({code:0,message:re})
      return

    }).catch(function(reason){
         console.log("err",reason)
        res.send({code:-1,message:reason.message})
        return
      });
   


}

exports.lcalpcsmeta=function(req,res,next){
    let pcsId=req.query.pcsId

    instances.findOne({type:'Processing','list.id':pcsId},(err,doc)=>{

        
        doc.list

    })
}

exports.uploadPcsMethod=function(req,res,next){


    let pcsId=req.query.id
    let type=req.query.type


    instances.findOne({type:type,'list.id':pcsId},(err,doc)=>{

        if(err||!doc){
            res.send({code:-1})
            return
        }
        let serviceItem=undefined
        for(let pcs of doc.list){
            if(pcs.id==pcsId){
                serviceItem=pcs
                break;
            }
        }

         if(serviceItem==undefined){
             res.send({code:-1})
             return
         }

        let upObj={
            'name':serviceItem.name,
            'userId':serviceItem.oid,
            'origination':'distributedContainer',
            'serverNode':'china',
            'ogmsdata':[]        
        }
        //服务迁移分为数据和非数据两种
        if(type!='Data'){
            // 服务迁移
            compressing.zip.compressDir(serviceItem.storagePath, __dirname+'/../service_migration_tep/'+serviceItem.id+'.zip')
            .then(() => {
                console.log('zip processing method success');

                upObj['ogmsdata'].push(fs.createReadStream(__dirname+'/../service_migration_tep/'+serviceItem.id+'.zip'))
                upObj['ogmsdata'].push(fs.createReadStream(__dirname+'/../config/config.udxcfg/'))


                let options = {
                    method : 'POST',
                    url : transitUrl+'/data',
                    headers : { 'Content-Type' : 'multipart/form-data' },
                    formData : upObj
                };
                //调用数据容器上传接口
                let promise= new Promise((resolve, reject) => {
                    let readStream = Request(options, (error, response, body) => {
                        if (!error) {
                            
                            resolve({response, body})
                        } else {
                            reject(error);
                        }
                    });
                });
                //返回数据下载id
                promise.then(function(v){
                    let r=JSON.parse(v.body)

                    if(r.code==-1){
                        res.send({code:-2,message:v.msg});
                        return
                    }else{
                        console.log('service migration id return')
                        fs.unlinkSync(__dirname+'/../service_migration_tep/'+serviceItem.id+'.zip')
                        res.send({code:0,uid:r.data.source_store_id})
                        return
                    }

                }).
                catch(err => {
                    console.error(err);
                }); 



            })
            .catch(err2 => {
                console.error(err2);
            }); 
        }else{

            // 数据迁移 300MB作为阈值，小于阈值直接上传，大于阈值切片上传
            // 300MB = 314572800 Byte
            

            let migFile = fs.statSync(__dirname+'/../dataStorage/'+serviceItem.id+'.zip');
            console.log('File Size in Bytes:- ' + migFile.size);


            if(migFile.size<=314572800){

                upObj['ogmsdata'].push(fs.createReadStream(__dirname+'/../dataStorage/'+serviceItem.id+'.zip'))
             
                upObj['ogmsdata'].push(fs.createReadStream(__dirname+'/../config/config.udxcfg'))

                let options = {
                    method : 'POST',
                    url : transitUrl+'/data',
                    headers : { 'Content-Type' : 'multipart/form-data' },
                    formData : upObj
                };
                //调用数据容器上传接口
                let promise= new Promise((resolve, reject) => {
                    let readStream = Request(options, (error, response, body) => {
                        if (!error) {
                            
                            resolve({response, body})
                        } else {
                            reject(error);
                        }
                    });
                });
                //返回数据下载id
                promise.then(function(v){
                    let r=JSON.parse(v.body)

                    if(r.code==-1){
                        res.send({code:-2,message:v.msg});
                        return
                    }else{
                        console.log('service migration ')
                    
                        res.send({code:0,uid:r.data.source_store_id})
                        return
                    }

                }).
                catch(err => {
                    console.error(err);
                }); 


            }else{
                
    
                    // let largrFile=fs.createReadStream(__dirname+'/../dataStorage/'+serviceItem.id+'.zip')
                    let p=__dirname+'/../dataStorage/'+serviceItem.id+'.zip'
                    // let largrFile=new File(p);
                    readBlob(blob, p, function (err, dataurl) {
                        if (err) throw err;
                        dataurl
                         
                        
                    });
                    
                    let name = serviceItem.name,        //文件名
                    size = migFile.size,        //总大小
                    succeed = 0;  //当前上传数
                    let shardSize = 2 *1024*1024,    //以2MB为一个分片
                    shardCount = Math.ceil(size / shardSize);  //总片数
    
                    /*生成上传分片文件顺充，通过async.eachLimit()进行同步上传
                        attr里面是[0,1,2,3...,最后一位]    
                    */
                    let attr=[];
                    for(let i=0;i<shardCount;++i){
                        attr.push(i);
                    }
                    async.eachLimit(attr,1,async function(item,callback){
                        let i=item;
                        let start = i * shardSize,//当前分片开始下标
                        end = Math.min(size, start + shardSize);//结束下标
    
                        //构造一个表单，FormData是HTML5新增的
                        let form = new FormData();
                        form.append("data", largrFile.slice(start,end));  //slice方法用于切出文件的一部分
                        form.append("name", name);//文件名字
                        form.append("total", shardCount);  //总片数
                        form.append("index", i + 1);   //当前片数'
    
                    
                        await axios.post('http://localhost:8898/upload',form,{
                            timeout: 120*1000
                        })
                        .then(axiosRes=>{
                            ++succeed;
                                
                                /*返回code为0是成功上传，1是请继续上传*/
                                if(axiosRes.data.code==0){
                                    console.log(axiosRes.data.mssg);
                                     
                                }else if(axiosRes.data.code==1){
    
                                    console.log(axiosRes.data.msg);
                                }
                                //生成当前进度百分比
                                _this.percentage=Math.round(succeed/shardCount*100);
                                /*如果是线上，去掉定时，直接callback()，
                                这样写是为方便，本地测试看到进度条变化
                                因为本地做上传测试是秒传，没有时间等待*/
                                // setTimeout(callback,50);
                                callback()
                        })
    
                    },function(err){
                        console.log(err);
                    });     

            }

        }

    })
}

exports.availableServices= function(req,res,next){



    instances.find({type:req.query.type},async function(err,docs){
        
        if(err){
            res.send({code:-1,data:err})
            return
        }
        
        if(docs.length==0){
            res.send({code:0,data:''})
            return
        }
         
       
         

        let redata=[]
        for(let doc of docs){
            doc.list.forEach(v=>{
                let re={}
                re['name']=v.name;
                re['id']=v.id 
                re['dataSet']=v.relatedData
                re['desc']=v.description
                re['date']=v.date
                if(v.meta!=undefined){
                    re['meta']={
                        'keywords':v.meta['keywords'],
                        'email':v.meta['email'],
                        'format':v.meta['format'],
                        'description':v.meta['descriptions']

                    }
                }
                // let xmlFile=v.fileList[0].split('.')[1]=='xml'?v.fileList[0]:v.fileList[1]
                // let xml=fs.readFileSync(v.storagePath+'/'+xmlFile);
                // re['xml']=xml;
                if(v['metaDetail']!=undefined){

                    // let json=JSON.parse(v['metaDetail'])
                  
                    re['metaDetail']=builder.buildObject(v['metaDetail'])
                }
                redata.push(re)

            })
        }
        res.send({code:0,data:redata})
        return
    })
}

exports.exeWithOtherData=function(req,res,next){

    let dataIdinCont=req.query.contDtId

    let downLoadUrl=transitUrl+'/data?uid='+dataIdinCont

    let dataInfo=transitUrl+'/info?uid='+dataIdinCont

    

    let saveDist=__dirname+'/../temp/'+dataIdinCont
    //调用数据容器上传接口
    let promise= new Promise((resolve, reject) => {
         //  处理下载流数据到本地

                request(dataInfo,(err,reqRes,body)=>{
                    if(err){
                        let msg={code:-2,message:"your data obtain err"}
                        res.send(msg);
                        return
                    }
                    if(reqRes.statusCode==200){
                        
                        let reJson=JSON.parse(reqRes.body)
                        let suffix=reJson.message.singleFileName.split('.')[1]
                        let stream = fs.createWriteStream(saveDist+'.'+suffix);
                        request(downLoadUrl).pipe(stream).on("close", function (err2) {

                            // fs.renameSync(saveDist, saveDist+'.'+suffix)
                            if(err2){
                                reject(err2)
                            }
                            let obj={
                                type:suffix,
                                dist:saveDist+'.'+suffix,
                                fileName:reJson.message.singleFileName
                            }
                            resolve(obj)
                        })
                     
                    }

                })
           
            
         
         
    })
    //返回数据下载id
    promise.then(function(fileInfo){


        
        console.log(fileInfo.dist)

        //判断是否是zip数据，还是单文件数据，因为外部数据源有者两种情况 
        if(fileInfo.type=='zip'){
            // 处理下载后的zip数据
        
            compressing.zip.uncompress(fileInfo.dist, __dirname+'/../temp/'+dataIdinCont)
            .then(()=>{
                


                instances.findOne({'list.id':req.query.pcsId},(err,doc)=>{
                    let py_script_path=undefined
                    let py_script_dir=undefined
                    let py_script=undefined

                    for(let it of doc.list){
                        if(it.id==req.query.pcsId){
                            py_script_dir=it.storagePath
                            py_script= it.fileList[0].split('.')[1]=='py'?it.fileList[0]:it.fileList[1]
                            break
                        }
                    }
                    py_script_path=py_script_dir+'/'+py_script

                    let input=path.normalize(__dirname+'/../temp/'+dataIdinCont)
                    let forward=input.replace(/\\/g,'%5C')
                    input=forward.replace(/%5C/g,'/')

                    let output=__dirname+'/../temp/out_'+dataIdinCont
                    if(fs.existsSync(output)){
                        // 如果存在就删除，不过一般不会
                        utils.delDir(output)
                    }
                    let mkdirPromise=fsPromises.mkdir(output)
                    output=path.normalize(output)
                    forward=output.replace(/\\/g,'%5C')
                    output=forward.replace(/%5C/g,'/')
                    mkdirPromise.then((v)=>{

                        let par= [ py_script_path,input,output]
                        //将参数数组填入
                        if(req.query.params!=undefined&&req.query.params!=''){
                            let r=req.query.params.split(',')
                            r.forEach(v=>{
                                par.push(v)
                            })
                        }
                        let pcs_stout=undefined
                        const ls = cp.spawn(cfg.pythonExePath, par);//python安装路径，python脚本路径，shp路径，照片结果路径
                        
                        ls.on('exit', (code) => {
                            console.log(`子进程使用代码 ${code} 退出`);
                            if(code!=0){
                                let msg={code:-2,message:'processing methods error'}
                                res.send(msg);
                                return
                            }
                            fs.readdir(output,(err,f_item)=>{
        
                                if(f_item.length==0){
                                    let msg={code:-2,message:'processing methods error'}
                                    if( pcs_stout!=undefined){
                                        msg.message=pcs_stout.toString('utf-8')
                                    }
                                    res.send(msg);
                                    return
                                }
                            
                                let upObj={
                                    'name':dataIdinCont,
                                    'userId':req.query.token,
                                    'origination':'distributedContainer',
                                    'serverNode':'china',
                                    'ogmsdata':[]        
                                }
                                f_item.forEach(v=>{
                                    upObj['ogmsdata'].push(fs.createReadStream(output+'/'+v))
                                })
                                let dataType=undefined
                                f_item.forEach(v=>{
                                    if(v.split(".")[1]==="shp"){
                                        dataType='shp'
                                    }else if(v.split(".")[1]==="tif"||v.split(".")[1]==="tiff"){
                                        dataType='tiff'
                                    }
        
                                })
                                //拼接配置文件
                                let udxcfg=cfg.configUdxCfg[0]+'\n'+cfg.configUdxCfg[1]+'\n'
                                for(let i=0;i<f_item.length;i++){
                                    udxcfg+=cfg.configUdxCfg[2]+'\n'
                                }
                                udxcfg+=cfg.configUdxCfg[3]+'\n'
                                udxcfg+=cfg.configUdxCfg[4]+'\n'
                                if(dataType==="shp"){
                                    udxcfg+=templateId.shp[0]
                                }else if(dataType=="tiff"){
                                    udxcfg+=templateId.tiff[0]
                                }else{
                                    udxcfg+=templateId.shp[0]
                                }
                                udxcfg+=cfg.configUdxCfg[5]+'\n'
                                udxcfg+=cfg.configUdxCfg[6]+'\n'
        
        
        
                                fs.writeFileSync(output+'/config.udxcfg',udxcfg)
        
                                upObj['ogmsdata'].push(fs.createReadStream(output+'/config.udxcfg')) 
        
                                
                                let options = {
                                    method : 'POST',
                                    url : transitUrl+'/data',
                                    headers : { 'Content-Type' : 'multipart/form-data' },
                                    formData : upObj
                                };
                                //调用数据容器上传接口
                                let promise= new Promise((resolve, reject) => {
                                    let readStream = Request(options, (error, response, body) => {
                                        if (!error) {
                                            
                                            resolve({response, body})
                                        } else {
                                            reject(error);
                                        }
                                    });
                                });
                                //返回数据下载id
                                promise.then(function(v){
                                    //删除配置文件
                                    fs.unlinkSync(output+'/config.udxcfg',udxcfg)
                                    
                                    // 删除处理数据
                                    utils.delDir(output)//数据处理输出文件夹
                                    fs.unlinkSync(fileInfo.dist)//下载的外部数据文件
                                    utils.delDir(input)//解压后的外部数据文件夹



                                    let r=JSON.parse(v.body)
                                    if(r.code==-1){
                                        res.send({code:-2,message:v.msg});
                                        return
                                    }else{
                                        console.log('insitu content data ',req.query.dataId,'process method',req.query.pcsId)
                                    
                                        res.send({code:0,uid:r.data.source_store_id,stout:pcs_stout.toString('utf-8')})
                                        return
                                    }
                                
                                },(rej_err)=>{
                                    console.log(rej_err)
                                })
                                
        
        
                            })
                        
        
                        });
                        
                        
                        
                        ls.on('error',(err)=>{
                            console.log(`错误 ${err}`);
                            res.send({code:-2,message:(err).toString()});
                            return;
                        })
                        ls.on('close', (code) => {//exit之后
                            console.log(`子进程close，退出码 ${code}`);
                            
                        });
                        ls.stdout.on('data', (data) => {
                            console.log(`stdout: ${data}`);
                            pcs_stout=data
                                                
                        })


                    })
        


                })

            })//end compressing
            .catch(err=>{
                console.log(err)
            })
        }else{
            // 处理下载后的单文件
            fs.mkdir(__dirname+'/../temp/'+dataIdinCont,(err)=>{
                fs.copyFile(fileInfo.dist,__dirname+'/../temp/'+dataIdinCont+'/'+fileInfo.fileName , ()=>{

                    

                    instances.findOne({'list.id':req.query.pcsId},(err,doc)=>{
                        
                        // 从库里拿到py文件路径
                        let py_script_path=undefined
                        let py_script_dir=undefined
                        let py_script=undefined
    
                        for(let it of doc.list){
                            if(it.id==req.query.pcsId){
                                py_script_dir=it.storagePath
                                py_script= it.fileList[0].split('.')[1]=='py'?it.fileList[0]:it.fileList[1]
                                break
                            }
                        }
                        py_script_path=py_script_dir+'/'+py_script
                        //输入输出路径指定
                        let input=path.normalize(__dirname+'/../temp/'+dataIdinCont)
                        let forward=input.replace(/\\/g,'%5C')
                        input=forward.replace(/%5C/g,'/')
    
                        let output=__dirname+'/../temp/out_'+dataIdinCont
                        if(fs.existsSync(output)){
                            // 如果存在就删除，不过一般不会
                            utils.delDir(output)
                        }
                        let mkdirPromise=fsPromises.mkdir(output)
                        output=path.normalize(output)
                        forward=output.replace(/\\/g,'%5C')
                        output=forward.replace(/%5C/g,'/')
                        mkdirPromise.then((v)=>{
    
                            let par= [ py_script_path,input,output]
                            //将参数数组填入
                            if(req.query.params!=undefined&&req.query.params!=''){
                                let r=req.query.params.split(',')
                                r.forEach(v=>{
                                    par.push(v)
                                })
                            }
                            let pcs_stout=undefined
                            const ls = cp.spawn(cfg.pythonExePath, par);//python安装路径，python脚本路径，shp路径，照片结果路径
                            
                            ls.on('exit', (code) => {
                                console.log(`子进程使用代码 ${code} 退出`);
                                if(code!=0){
                                    let msg={code:-2,message:'processing methods error'}
                                    res.send(msg);
                                    return
                                }
                                fs.readdir(output,(err,f_item)=>{
            
                                    if(f_item.length==0){
                                        let msg={code:-2,message:'processing methods error'}
                                        if( pcs_stout!=undefined){
                                            msg.message=pcs_stout.toString('utf-8')
                                        }
                                        res.send(msg);
                                        return
                                    }
                                
                                    let upObj={
                                        'name':dataIdinCont,
                                        'userId':req.query.token,
                                        'origination':'distributedContainer',
                                        'serverNode':'china',
                                        'ogmsdata':[]        
                                    }
                                    f_item.forEach(v=>{
                                        upObj['ogmsdata'].push(fs.createReadStream(output+'/'+v))
                                    })
                                    let dataType=undefined
                                    f_item.forEach(v=>{
                                        if(v.split(".")[1]==="shp"){
                                            dataType='shp'
                                        }else if(v.split(".")[1]==="tif"||v.split(".")[1]==="tiff"){
                                            dataType='tiff'
                                        }
            
                                    })
                                    //拼接配置文件
                                    let udxcfg=cfg.configUdxCfg[0]+'\n'+cfg.configUdxCfg[1]+'\n'
                                    for(let i=0;i<f_item.length;i++){
                                        udxcfg+=cfg.configUdxCfg[2]+'\n'
                                    }
                                    udxcfg+=cfg.configUdxCfg[3]+'\n'
                                    udxcfg+=cfg.configUdxCfg[4]+'\n'
                                    if(dataType==="shp"){
                                        udxcfg+=templateId.shp[0]
                                    }else if(dataType=="tiff"){
                                        udxcfg+=templateId.tiff[0]
                                    }else{
                                        udxcfg+=templateId.shp[0]
                                    }
                                    udxcfg+=cfg.configUdxCfg[5]+'\n'
                                    udxcfg+=cfg.configUdxCfg[6]+'\n'
            
            
            
                                    fs.writeFileSync(output+'/config.udxcfg',udxcfg)
            
                                    upObj['ogmsdata'].push(fs.createReadStream(output+'/config.udxcfg')) 
            
                                    
                                    let options = {
                                        method : 'POST',
                                        url : transitUrl+'/data',
                                        headers : { 'Content-Type' : 'multipart/form-data' },
                                        formData : upObj
                                    };
                                    //调用数据容器上传接口
                                    let promise= new Promise((resolve, reject) => {
                                        let readStream = Request(options, (error, response, body) => {
                                            if (!error) {
                                                
                                                resolve({response, body})
                                            } else {
                                                reject(error);
                                            }
                                        });
                                    });
                                    //返回数据下载id
                                    promise.then(function(v){
                                        //删除配置文件
                                        fs.unlinkSync(output+'/config.udxcfg',udxcfg)
                                        
                                        // 删除处理数据
                                        utils.delDir(output)//数据处理输出文件夹
                                        fs.unlinkSync(fileInfo.dist)//下载的外部数据文件
                                        utils.delDir(input)//解压后的外部数据文件夹
    
    
    
                                        let r=JSON.parse(v.body)
                                        if(r.code==-1){
                                            res.send({code:-2,message:v.msg});
                                            return
                                        }else{
                                            console.log('insitu content data ',req.query.dataId,'process method',req.query.pcsId)
                                            if(pcs_stout==undefined){
                                                pcs_stout="no print message"
                                            }
                                            res.send({code:0,uid:r.data.source_store_id,stout:pcs_stout.toString('utf-8')})
                                            return
                                        }
                                    
                                    },(rej_err)=>{
                                        console.log(rej_err)
                                    })
                                    
            
            
                                })
                            
            
                            });
                            
                            
                            
                            ls.on('error',(err)=>{
                                console.log(`错误 ${err}`);
                                res.send({code:-2,message:(err).toString()});
                                return;
                            })
                            ls.on('close', (code) => {//exit之后
                                console.log(`子进程close，退出码 ${code}`);
                                
                            });
                            ls.stdout.on('data', (data) => {
                                console.log(`stdout: ${data}`);
                                pcs_stout=data
                                                    
                            })
    
    
                        })
            
    
    
                    })
    




























                })

            })


        }
        
    },(getDataFromDataContainerError)=>{//reject 从数据容器获取数据失败
        let msg={code:-2,message:getDataFromDataContainerError}
        res.send(msg);
        return
    })


}

// 可视化结果
exports.visualResult=function(req,res){

    let id=req.query.id

    






}

// saga service
exports.sagaCapabilities=function(req,res){

    

        let tree_path='./lib/saga_tools/json/tree.json';
        let tools_tree='./lib/saga_tools/json/tools_tree.json';

        let library,tool,funcIdx;

        let result;

        fsPromises.readFile(tree_path).then(data=>{            
            let json=JSON.parse(data);            
            //获取工具项 Climite->Tool
            if(!req.query.library){
                result={'tools':'Based on SAGA Version 6.3.0'}
                              
                for(let k in json){
                    result[k]=[];
                    for(let v in json[k]){
                        result[k].push(v);
                    }
                }
                res.send(result);
                return;

            }else
          //获取对应工具项下的所有工具 Tool->Multi Level to Surface Interpolation
            if(req.query.library&&req.query.tool&&!req.query.funcIdx){
                result={}
                library=req.query.library;                                
                tool=req.query.tool;
                result['library']=library;
                result['tool']=tool;
                result['func']=[]
                fsPromises.readFile(tools_tree).then(data2=>{
                    let json2=JSON.parse(data2);

                    for(let t of json2['tools']){
                        if(t.value==library){
                            for (const t2 of t.children) {
                                if(t2.value==tool){
                                    for (const t3 of t2.children) {
                                        result['func'].push({'index':t3.id,'func':t3.value})
                                    }
                                }
                            }
                        }
                    }
                    res.send(result);
                    return;


                }).catch(err=>{
                    res.send(err);
                    return;
                })
            }else
            //获取对应工具详情Multi Level to Surface Interpolation-> input
            if(req.query.library&&req.query.tool&&req.query.funcIdx){
                result={}
                library=req.query.library;                                
                tool=req.query.tool;
                funcIdx=req.query.funcIdx;

                result['library']=library;
                result['tool']=tool;
                result['func Index']=funcIdx;

                fsPromises.readFile(tools_tree).then(data2=>{
                    let json2=JSON.parse(data2);

                    for(let t of json2['tools']){
                        if(t.value==library){
                            for (const t2 of t.children) {
                                if(t2.value==tool){
                                    
                                    fsPromises.readFile(t2.id).then(data3=>{
                                        //获取最下层具体工具的元数据
                                        let json3=JSON.parse(data3)
                                        result['tool name']=json3['tools'][funcIdx]['tool_name'];
                                        result['info']=json3['tools'][funcIdx];

                                        res.send(result);
                                        return;
                                    }).catch(err=>{
                                        res.send(err);
                                        return;
                                    })
                                }
                            }
                        }
                    }

                

                }).catch(err=>{
                    res.send(err);
                    return;
                });
            
            }else{
                res.send({'err':'parameter or else error'});
                return;
            }            
        }).catch(err=>{
            res.send(err);
            return;
        })

       
    
    
}

exports.executeSaga=function(req,res,next){
    let par= []

    if(req.query.library){
        par.push(req.query.library)
    }
    if(req.query.tool){
        par.push(req.query.tool)
    }

    try{
        const ls = cp.spawn(cfg.sagaExe,par);
        ls.on('error',(err)=>{
            console.log(`错误 ${err}`);
        })
        ls.on('close', (code) => {
            console.log(`子进程退出，退出码 ${code}`);
        });
        ls.stdout.on('data', (data) => {
    
            let str=data.toString('utf-8')

            res.end(str)
            
        });
    }catch(err){
        if(err){res.end(err)}
    }
}

/**
 * url形式的数据调用处理方法
 * @param {请求参数} req 
 * @param {回调参数} res 
 */
exports.invokeProUrl = function(req,res,next){
    let uid = uuid.v4();
    console.log(req.body);
     
    let dirPath = __dirname + '/../urlFile/'+ uid + '/';
    if(!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath);
        console.log("folder create success!")
    }else{
        console.log("folder is already exist");
    }

    //token pcsId url params
    //根据url下载数据
    // var form =new formidable.IncomingForm();
    var fileType;
    var fileName;
    // form.parse(req, (err, fields, files) =>{
        let url = req.body.url;
        function operation(url, filename,callback){
            var stream = fs.createWriteStream(path.join(dirPath, "test"));
            //下载文件
            request(url,function(err,response, body){
                console.log(response.headers['content-disposition']);
                var arr = response.headers['content-disposition'].split('.');
                fileType = arr[arr.length-1];
                arr = response.headers['content-disposition'].split('=');
                fileName = arr[arr.length-1];
                console.log("fileType: " + fileType + " fileName: " + fileName);
            }).pipe(stream).on('close', callback);
            console.log("operation函数里");
        }
        //操作
        operation(url, fileName,function(){
            console.log(fileName + 'download ok');
            //修改文件名称
            fs.rename(dirPath + "/test", dirPath + "/" + fileName,(err) =>{
                if(err){
                    throw err;
                }


            
                
                if(fileType === 'zip'){
                    // 处理下载后的zip数据
                    var zipFilePath = dirPath + '/' + fileName;
                    compressing.zip.uncompress(zipFilePath, dirPath + '/uncompress')
                        .then(()=>{
                            instances.findOne({'list.id': req.body.pcsId},(err, doc) =>{
                                let py_script_path=undefined
                                let py_script_dir=undefined
                                let py_script=undefined

                                for(let it of doc.list){
                                    if(it.id==req.body.pcsId){
                                        py_script_dir=it.storagePath
                                        py_script= it.fileList[0].split('.')[1]=='py'?it.fileList[0]:it.fileList[1]
                                        break
                                    }
                                } 
                                py_script_path=py_script_dir+'/'+py_script;

                                let input = path.normalize(dirPath + '/uncompress');
                                let forward = input.replace(/\\/g,'%5C');
                                input = forward.replace(/%5C/g,'/');

                                let output = dirPath + '/output';
                                if(fs.existsSync(output)){
                                    // 如果存在就删除，不过一般不会
                                    utils.delDir(output)
                                }
                                let mkdirPromise=fsPromises.mkdir(output);
                                output=path.normalize(output);
                                forward=output.replace(/\\/g,'%5C');
                                output=forward.replace(/%5C/g,'/');

                                mkdirPromise.then((v)=>{

                                    let par= [ py_script_path,input,output]
                                    //将参数数组填入
                                    if(req.body.params!=undefined&&req.body.params!=''){
                                        let r=req.body.params.split(',')
                                        r.forEach(v=>{
                                            par.push(v)
                                        })
                                    }
                                    let pcs_stout=undefined
                                    const ls = cp.spawn(cfg.pythonExePath, par);//python安装路径，python脚本路径，shp路径，照片结果路径
                                    
                                    ls.on('exit', (code) => {
                                        console.log(`子进程使用代码 ${code} 退出`);
                                        if(code!=0){
                                            let msg={code:-2,message:'processing methods error'}
                                            res.send(msg);
                                            return
                                        }
                                        fs.readdir(output,(err,f_item)=>{
                    
                                            if(f_item.length==0){
                                                let msg={code:-2,message:'processing methods error'}
                                                if( pcs_stout!=undefined){
                                                    msg.message=pcs_stout.toString('utf-8')
                                                }
                                                res.send(msg);
                                                return
                                            }
                                        
                                            let upObj={
                                                'name':"test",
                                                'userId':req.body.token,
                                                'origination':'distributedContainer',
                                                'serverNode':'china',
                                                'ogmsdata':[]        
                                            }
                                            f_item.forEach(v=>{
                                                upObj['ogmsdata'].push(fs.createReadStream(output+'/'+v))
                                            })
                                            let dataType=undefined
                                            f_item.forEach(v=>{
                                                if(v.split(".")[1]==="shp"){
                                                    dataType='shp'
                                                }else if(v.split(".")[1]==="tif"||v.split(".")[1]==="tiff"){
                                                    dataType='tiff'
                                                }
                    
                                            })
                                            //拼接配置文件
                                            let udxcfg=cfg.configUdxCfg[0]+'\n'+cfg.configUdxCfg[1]+'\n'
                                            for(let i=0;i<f_item.length;i++){
                                                udxcfg+=cfg.configUdxCfg[2]+'\n'
                                            }
                                            udxcfg+=cfg.configUdxCfg[3]+'\n'
                                            udxcfg+=cfg.configUdxCfg[4]+'\n'
                                            if(dataType==="shp"){
                                                udxcfg+=templateId.shp[0]
                                            }else if(dataType=="tiff"){
                                                udxcfg+=templateId.tiff[0]
                                            }else{
                                                udxcfg+=templateId.shp[0]
                                            }
                                            udxcfg+=cfg.configUdxCfg[5]+'\n'
                                            udxcfg+=cfg.configUdxCfg[6]+'\n'
                    
                    
                    
                                            fs.writeFileSync(output+'/config.udxcfg',udxcfg)
                    
                                            upObj['ogmsdata'].push(fs.createReadStream(output+'/config.udxcfg')) 
                    
                                            
                                            let options = {
                                                method : 'POST',
                                                url : transitUrl+'/data',
                                                headers : { 'Content-Type' : 'multipart/form-data' },
                                                formData : upObj
                                            };
                                            //调用数据容器上传接口
                                            let promise= new Promise((resolve, reject) => {
                                                let readStream = Request(options, (error, response, body) => {
                                                    if (!error) {
                                                        
                                                        resolve({response, body})
                                                    } else {
                                                        reject(error);
                                                    }
                                                });
                                            });
                                            //返回数据下载id
                                            promise.then(function(v){
                                                //删除配置文件
                                                fs.unlinkSync(output+'/config.udxcfg',udxcfg)
                                                
                                                // 删除处理数据
                                                utils.delDir(dirPath);
                                                // utils.delDir(output)//数据处理输出文件夹
                                                // fs.unlinkSync(fileInfo.dist)//下载的外部数据文件
                                                // utils.delDir(input)//解压后的外部数据文件夹
            
            
            
                                                let r=JSON.parse(v.body)
                                                if(r.code==-1){
                                                    res.send({code:-2,message:v.msg});
                                                    return
                                                }else{
                                                    console.log('process method',req.body.pcsId)
                                                
                                                    res.send({code:0,uid:r.data.source_store_id,stout:pcs_stout.toString('utf-8')})
                                                    return
                                                }
                                            
                                            },(rej_err)=>{
                                                console.log(rej_err)
                                            })
                    
                                        })
                    
                                    });
                                    
                                    ls.on('error',(err)=>{
                                        console.log(`错误 ${err}`);
                                        res.send({code:-2,message:(err).toString()});
                                        return;
                                    })
                                    ls.on('close', (code) => {//exit之后
                                        console.log(`子进程close，退出码 ${code}`);
                                        
                                    });
                                    ls.stdout.on('data', (data) => {
                                        console.log(`stdout: ${data}`);
                                        pcs_stout=data
                                                            
                                    })
            
            
                                })
                            })
                        })
                    
                }else{
                    instances.findOne({'list.id':req.body.pcsId}, (err,doc)=>{
                            // 从库里拿到py文件路径
                            let py_script_path=undefined
                            let py_script_dir=undefined
                            let py_script=undefined
        
                            for(let it of doc.list){
                                if(it.id==req.body.pcsId){
                                    py_script_dir=it.storagePath
                                    py_script= it.fileList[0].split('.')[1]=='py'?it.fileList[0]:it.fileList[1]
                                    break
                                }
                            }
                            py_script_path=py_script_dir+'/'+py_script
                            //输入输出路径指定
                            let input = path.normalize(dirPath);
                            let forward=input.replace(/\\/g,'%5C')
                            input=forward.replace(/%5C/g,'/')
                            
                            let output = dirPath + '/output';
                            if(fs.existsSync(output)){
                                // 如果存在就删除，不过一般不会
                                utils.delDir(output)
                            }
                            let mkdirPromise=fsPromises.mkdir(output)
                            output=path.normalize(output)
                            forward=output.replace(/\\/g,'%5C')
                            output=forward.replace(/%5C/g,'/')
                                                    mkdirPromise.then((v)=>{
        
                                let par= [ py_script_path,input,output]
                                //将参数数组填入
                                if(req.body.params&&req.body.params!=''){
                                    let r=req.body.params.split(',')
                                    r.forEach(v=>{
                                        par.push(v)
                                    })
                                }
                                let pcs_stout=undefined
                                const ls = cp.spawn(cfg.pythonExePath, par);//python安装路径，python脚本路径，shp路径，照片结果路径
                                
                                ls.on('exit', (code) => {
                                    console.log(`子进程使用代码 ${code} 退出`);
                                    if(code!=0){
                                        let msg={code:-2,message:'processing methods error'}
                                        res.send(msg);
                                        return
                                    }
                                    fs.readdir(output,(err,f_item)=>{
                
                                        if(f_item.length==0){
                                            let msg={code:-2,message:'processing methods error'}
                                            if( pcs_stout!=undefined){
                                                msg.message=pcs_stout.toString('utf-8')
                                            }
                                            res.send(msg);
                                            return
                                        }
                                    
                                        let upObj={
                                            'name':"test",
                                            'userId':req.body.token,
                                            'origination':'distributedContainer',
                                            'serverNode':'china',
                                            'ogmsdata':[]        
                                        }
                                        f_item.forEach(v=>{
                                            upObj['ogmsdata'].push(fs.createReadStream(output+'/'+v))
                                        })
                                        let dataType=undefined
                                        f_item.forEach(v=>{
                                            if(v.split(".")[1]==="shp"){
                                                dataType='shp'
                                            }else if(v.split(".")[1]==="tif"||v.split(".")[1]==="tiff"){
                                                dataType='tiff'
                                            }
                
                                        })
                                        //拼接配置文件
                                        let udxcfg=cfg.configUdxCfg[0]+'\n'+cfg.configUdxCfg[1]+'\n'
                                        for(let i=0;i<f_item.length;i++){
                                            udxcfg+=cfg.configUdxCfg[2]+'\n'
                                        }
                                        udxcfg+=cfg.configUdxCfg[3]+'\n'
                                        udxcfg+=cfg.configUdxCfg[4]+'\n'
                                        if(dataType==="shp"){
                                            udxcfg+=templateId.shp[0]
                                        }else if(dataType=="tiff"){
                                            udxcfg+=templateId.tiff[0]
                                        }else{
                                            udxcfg+=templateId.shp[0]
                                        }
                                        udxcfg+=cfg.configUdxCfg[5]+'\n'
                                        udxcfg+=cfg.configUdxCfg[6]+'\n'
                
                
                
                                        fs.writeFileSync(output+'/config.udxcfg',udxcfg)
                
                                        upObj['ogmsdata'].push(fs.createReadStream(output+'/config.udxcfg')) 
                
                                        
                                        let options = {
                                            method : 'POST',
                                            url : transitUrl+'/data',
                                            headers : { 'Content-Type' : 'multipart/form-data' },
                                            formData : upObj
                                        };
                                        //调用数据容器上传接口
                                        let promise= new Promise((resolve, reject) => {
                                            let readStream = Request(options, (error, response, body) => {
                                                if (!error) {
                                                    
                                                    resolve({response, body})
                                                } else {
                                                    reject(error);
                                                }
                                            });
                                        });
                                        //返回数据下载id
                                        promise.then(function(v){
                                            //删除配置文件
                                            fs.unlinkSync(output+'/config.udxcfg',udxcfg)
                                            utils.delDir(dirPath);
                                            // 删除处理数据
                                            // utils.delDir(output)//数据处理输出文件夹
                                            // fs.unlinkSync(fileInfo.dist)//下载的外部数据文件
                                            // utils.delDir(input)//解压后的外部数据文件夹
        
        
        
                                            let r=JSON.parse(v.body)
                                            if(r.code==-1){
                                                res.send({code:-2,message:v.msg});
                                                return
                                            }else{
                                                console.log('process method',req.body.pcsId)
                                                if(pcs_stout==undefined){
                                                    pcs_stout="no print message"
                                                }
                                                res.send({code:0,uid:r.data.source_store_id,stout:pcs_stout.toString('utf-8')})
                                                return
                                            }
                                        
                                        },(rej_err)=>{
                                            console.log(rej_err)
                                        })
                                        
                
                
                                    })
                                
                
                                });
                                
                                
                                
                                ls.on('error',(err)=>{
                                    console.log(`错误 ${err}`);
                                    res.send({code:-2,message:(err).toString()});
                                    return;
                                })
                                ls.on('close', (code) => {//exit之后
                                    console.log(`子进程close，退出码 ${code}`);
                                    
                                });
                                ls.stdout.on('data', (data) => {
                                    console.log(`stdout: ${data}`);
                                    pcs_stout=data
                                                        
                                })
        
        
                            })
                    })

                }
            })
        });

        console.log("主步骤");
        //python调用处理方法
    // })
}


exports.visualResultHtml=function(req,res,next){
    let htmlPath=req.query.path

    fs.readFile(htmlPath,(err,data)=>{
        if(err||!data){
            res.send({code:-1})
            return
        }
        res.setHeader('Content-Type', 'text/html')
        res.end(data)
        
    })

    //todo: 后台页面给前台 text/html
}