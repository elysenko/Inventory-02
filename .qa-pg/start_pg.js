const EmbeddedPostgres = require('embedded-postgres').default
const pg = new EmbeddedPostgres({
  databaseDir: __dirname + '/data',
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
})
;(async () => {
  await pg.initialise()
  await pg.start()
  try { await pg.createDatabase('app') } catch (e) { console.log('createDatabase:', e.message) }
  console.log('READY')
})().catch(e => { console.error(e); process.exit(1) })
