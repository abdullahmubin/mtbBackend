import assert from 'assert';
import request from 'supertest';
import configureApp from '../src/controllers/index.js';
import express from 'express';
import { startMemoryDb, stopMemoryDb } from './setupMemoryDb.js';
import mongoose from 'mongoose';
import ReminderDB from '../src/models/Reminder.js';
import TemplateDB from '../src/models/Template.js';
import { startRemindersWorker } from '../src/workers/remindersWorker.js';

let app;
let server;
let worker;

describe('contracts send flow (integration)', function(){
  this.timeout(10000);
  before(async ()=>{
  await startMemoryDb();
  // start express app by calling configure
  const exp = express();
  configureApp(exp);
  app = exp;
  });
  after(async ()=>{
    if(worker && worker.close) await worker.close();
  await stopMemoryDb();
  });

  it('creates contract, enqueues send and worker marks reminder sent', async ()=>{
    // create minimal contract via service or direct model
    const ContractsDB = (await import('../src/models/contracts.js')).default;
    const c = await ContractsDB.create({ organization_id: 'org-1', tenant_id: 't-1', title: 'Test Contract' });
    // POST send
    const res = await request(app).post(`/api/contracts/${c._id}/send`).send({ channel: 'email' }).set('Accept','application/json');
    assert.equal(res.status, 200);
    const remId = res.body.reminderId;
    assert.ok(remId);

    // wait a short time for worker to process
    await new Promise(r => setTimeout(r, 800));

  // call processReminder directly (avoid redis dependency in test)
  const { processReminder } = await import('../src/workers/remindersWorker.js');
  await processReminder(remId);
  const rem = await ReminderDB.findById(remId).exec();
    assert.ok(rem);
    assert.equal(rem.status, 'sent');

    // contract audit appended
    const fresh = await ContractsDB.findById(c._id).exec();
    assert.ok(Array.isArray(fresh.audit) && fresh.audit.length>0);
  });
});
