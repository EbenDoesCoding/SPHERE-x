import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateQuery,endpointParams,apiURL,imageURL,mjdISO,orderedFrames,scientificWarnings} from '../public/core.js';
const q={ra:133.79513,dec:-7.24515,size:.05,mode:'best'};
test('validates API limits and group selection',()=>{assert.deepEqual(validateQuery(q),q);for(const bad of [{ra:''},{ra:361},{dec:-91},{size:.31},{detector:7},{mode:'group'},{mode:'group',group_id:1.5}])assert.throws(()=>validateQuery({...q,...bad}));assert.equal(validateQuery({...q,mode:'group',group_id:'2'}).group_id,2);});
test('stars uses arcminutes while frame queries keep degrees',()=>{assert.equal(endpointParams('/stars',q).size,3);assert.equal(endpointParams('/overlay',q).size,.05);assert.deepEqual(endpointParams('/health',q),{});});
test('URL encoding and backend image origin',()=>{assert.equal(new URL(apiURL('https://sphere-x.onrender.com/','/resolve',{q:"Barnard's Star"})).searchParams.get('q'),"Barnard's Star");assert.equal(imageURL('https://sphere-x.onrender.com','/static/one.png'),'https://sphere-x.onrender.com/static/one.png');assert.throws(()=>imageURL('https://test.com','javascript:alert(1)'));});
test('sorts by time without losing overlay source index',()=>{const sorted=orderedFrames([{t_mjd:10},{t_mjd:5}]);assert.equal(sorted[0].sourceIndex,1);assert.equal(mjdISO(40587),'1970-01-01T00:00:00.000Z');});
test('warns on mixed bands, insufficient epochs, unusable groups',()=>{const w=scientificWarnings({frames:[{epoch:0}],meta:{mode:'all',selected_groups:[2],groups:[{id:2,usable_for_motion:false}],warnings:['Upstream warning']}});assert.equal(w.length,4);});
