/* Studio AI Phase 2 — per-conversation attachment persistence using IndexedDB. */
(function(){
 'use strict';
 var DB_NAME='dts-studio-ai-files', STORE='attachments', dbPromise=null;
 function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(function(resolve,reject){
   if(!window.indexedDB){reject(new Error('Persistent file storage is not supported in this browser.'));return;}
   var request=window.indexedDB.open(DB_NAME,1);
   request.onupgradeneeded=function(){
    var db=request.result;
    if(!db.objectStoreNames.contains(STORE)){
     var store=db.createObjectStore(STORE,{keyPath:'id'});
     store.createIndex('conversationId','conversationId',{unique:false});
    }
   };
   request.onsuccess=function(){resolve(request.result);};
   request.onerror=function(){reject(request.error||new Error('Could not open file storage.'));};
  });
  return dbPromise;
 }
 function transaction(mode,work){
  return openDB().then(function(db){
   return new Promise(function(resolve,reject){
    var tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),result;
    try{result=work(store,tx);}catch(e){reject(e);return;}
    tx.oncomplete=function(){resolve(result&&result.result!==undefined?result.result:result);};
    tx.onerror=function(){reject(tx.error||new Error('File storage operation failed.'));};
    tx.onabort=function(){reject(tx.error||new Error('File storage operation was cancelled.'));};
   });
  });
 }
 function save(record){return transaction('readwrite',function(store){return store.put(record);});}
 function list(conversationId){
  return openDB().then(function(db){
   return new Promise(function(resolve,reject){
    var tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).index('conversationId').getAll(conversationId);
    request.onsuccess=function(){resolve(request.result||[]);};
    request.onerror=function(){reject(request.error||new Error('Could not load conversation files.'));};
   });
  });
 }
 function remove(id){return transaction('readwrite',function(store){return store.delete(id);});}
 function removeConversation(conversationId){
  return openDB().then(function(db){
   return new Promise(function(resolve,reject){
    var tx=db.transaction(STORE,'readwrite'),index=tx.objectStore(STORE).index('conversationId');
    var request=index.openCursor(IDBKeyRange.only(conversationId));
    request.onsuccess=function(){var cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
    tx.oncomplete=function(){resolve(true);};
    tx.onerror=function(){reject(tx.error||new Error('Could not remove conversation files.'));};
   });
  });
 }
 window.dtsStudioAttachmentStore={save:save,list:list,remove:remove,removeConversation:removeConversation};
})();