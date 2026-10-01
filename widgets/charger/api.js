'use strict';
module.exports={
  overview:async({homey})=>homey.app.overview(),
  control:async({homey,body})=>{await homey.app.control(body.id,body.action,body.args||{});return {ok:true};}
};
