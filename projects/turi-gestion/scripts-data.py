from pathlib import Path
import json,sqlite3,datetime,base64,mimetypes
R=Path(__file__).parent;A=R/'dist/assets'
companies=json.loads((R/'docs/company-sources.json').read_text())
portals={'segunda':'https://app-launcher.papps.lasegunda.com.ar/','mercantil':'https://servicios.mercantilandina.com.ar/sigmav3/','federacion':'https://online.fedpat.com.ar/self/homeWin32.do','rivadavia':'https://www.sistemas.segurosrivadavia.com/sistemas/login/login_intra_pas.php?u=P','sancor':'https://portalintermediarios.gruposancorseguros.com/','cristobal':'https://productores.sancristobal.com.ar/','zurich':'https://www.zurich.com.ar/es-ar/productores','allianz':'https://www.allianz.com.ar/descubri-allianz/productores/herramientas-gestion/allianznet.html','provincia':'https://portal.provinciaseguros.com.ar/pas-web/','mapfre':'https://mapfrenet.mapfre.com.ar/mapfrenet/','holando':'https://www.laholando.com/','experta':'https://www.experta.com.ar/index.php/productores/','triunfo':'https://triunfoseguros.com/comunidad-triunfo/productor/soy-productor/','atm':'https://extranet.atmseguros.com.ar/','lps':'https://intranet.lps.com.ar/'}
# Human-visible official PAS page when a stable login deep link is not established.
for n,c in enumerate(companies):
 c['portal']=portals[c['id']];c['code']='DEMO-'+str(2100+n);c['connection']='Acceso externo';c['active']=n<6
 c['portalKind']='Página oficial' if c['id'] in ['zurich','holando','experta','triunfo','allianz'] else 'Portal PAS'
for id in ['sancor','zurich']:
 c=next(c for c in companies if c['id']==id)
 # Prefer a verified official landing page rather than inventing a portal path.
 if id=='sancor':c['portal']='https://portalintermediarios.gruposancorseguros.com/'
 if id=='zurich':c['portal']='https://www.zurich.com.ar/'
names=['María López','Carlos Fernández','Lucía García','Roberto Pérez','Ana Rodríguez','Diego Martínez','Paula Gómez','Martín González','Sofía Álvarez','Javier Romero','Valeria Torres','Pablo Díaz','Camila Sánchez','Nicolás Castro','Laura Ruiz','Andrés Molina','Florencia Silva','Gabriel Herrera','Julieta Vega','Sebastián Ríos','Carolina Méndez','Matías Acosta','Andrea Ortiz','Fernando Suárez','Natalia Medina','Gonzalo Aguirre','Mariana Benítez','Tomás Arias','Cecilia Navarro','Ignacio Costa']
categories=['Autos','Hogar','Autos','Caución','Comercio','Accidentes personales','Motos','Responsabilidad civil','Vida','Autos']
risks=['Toyota Corolla XEi 2021 · AB 123 CD','Casa · Villa Ballester','Volkswagen Gol Trend 2019 · AC 456 EF','Alquiler vivienda · San Martín','Local de indumentaria · CABA','Actividad independiente · electricidad','Honda Wave 110 · A123 BCD','Actividad profesional · arquitectura','Protección familiar','Fiat Cronos 2023 · AE 789 GH']
base=datetime.date(2026,10,19)
def date(n):return (base+datetime.timedelta(days=n)).isoformat()
policies=[];clients=[]
for i in range(230):
 cid=f'CLI-{i+1:03d}';name=names[i%len(names)]+(' '+str(i//len(names)+1) if i>=len(names) else '')
 clients.append({'id':cid,'name':name,'email':f'cliente{i+1:03d}@example.com','phone':'Sin teléfono real en demo','marketing':i%4==0})
 policies.append({'id':f'POL-{100001+i}','clientId':cid,'client':name,'company':companies[i%15]['id'],'category':categories[i%10],'risk':risks[i%10],'premium':round(16500+(i%18)*3650),'expiry':date(i%7 if i<12 else 35+i%240),'status':'Activa','payment':'Pendiente' if i in [1,16,26] else 'Al día','coverage':'Terceros completo' if categories[i%10]=='Autos' else 'Plan integral de muestra','sum':14000000+(i%5)*2000000,'deductible':'Según condiciones de muestra','source':'Cartera ficticia · no importada de compañías'})
alerts=[{'id':'A1','policyId':'POL-100001','title':'Renovación para confirmar hoy','category':'Renovaciones','priority':'red','company':'segunda','client':names[0],'due':date(0),'source':'Portal · muestra','detail':'La vigencia de muestra vence hoy. Revisá condiciones y prepará el aviso para María.','done':False},
{'id':'A2','policyId':'POL-100002','title':'Cuota pendiente de pago','category':'Pagos','priority':'red','company':'mercantil','client':names[1],'due':date(0),'source':'Correo · muestra','detail':'Hay una cuota pendiente. Verificá el estado en la compañía antes de comunicar una caída de cobertura.','done':False},
{'id':'A3','policyId':'POL-100003','title':'Siniestro sin novedades hace 17 días','category':'Siniestros','priority':'yellow','company':'federacion','client':names[2],'due':date(1),'source':'Regla de seguimiento · muestra','detail':'El expediente SIN-2401 no registra avances desde hace 17 días. Prepará una consulta y registrá el próximo paso.','done':False},
{'id':'A4','policyId':'POL-100004','title':'Recotizar antes de la renovación','category':'Recotizaciones','priority':'yellow','company':'rivadavia','client':names[3],'due':date(2),'source':'Portal · muestra','detail':'Compará suma asegurada, condiciones y prima. No compares únicamente el importe.','done':False},
{'id':'A5','policyId':'POL-100005','title':'Solicitud de baja para revisar','category':'Bajas','priority':'yellow','company':'sancor','client':names[4],'due':date(1),'source':'Solicitud · muestra','detail':'El cliente pidió revisar la baja. Confirmá motivo, fecha y condiciones antes de actuar en la compañía.','done':False},
{'id':'A6','policyId':'POL-100006','title':'Actualización de datos del riesgo','category':'Actualizaciones','priority':'yellow','company':'cristobal','client':names[5],'due':date(3),'source':'Correo · muestra','detail':'Hay nuevos datos de la actividad. Prepará la revisión de cobertura y el eventual endoso.','done':False},
{'id':'A7','policyId':'POL-100007','title':'Pago informado, listo para verificar','category':'Pagos','priority':'green','company':'zurich','client':names[6],'due':date(3),'source':'Portal · muestra','detail':'Se recibió una novedad de pago de ejemplo. Verificá su imputación en el portal oficial.','done':False}]
claims=[{'id':'SIN-2401','policyId':'POL-100003','client':names[2],'company':'federacion','type':'Choque · daño parcial','stage':'Espera aseguradora','lastUpdate':date(-17),'next':'Solicitar informe de peritación','notes':[]}, {'id':'SIN-2402','policyId':'POL-100002','client':names[1],'company':'mercantil','type':'Daño por agua · hogar','stage':'En gestión','lastUpdate':date(-3),'next':'Completar presupuesto de reparación','notes':[]}, {'id':'SIN-2403','policyId':'POL-100008','client':names[7],'company':'rivadavia','type':'Responsabilidad civil','stage':'Ingresado','lastUpdate':date(-1),'next':'Revisar denuncia y documentación','notes':[]}, {'id':'SIN-2404','policyId':'POL-100010','client':names[9],'company':'segunda','type':'Robo de rueda · auto','stage':'Espera aseguradora','lastUpdate':date(-8),'next':'Esperar confirmación de reposición','notes':[]}, {'id':'SIN-2405','policyId':'POL-100007','client':names[6],'company':'atm','type':'Robo de moto','stage':'En gestión','lastUpdate':date(-15),'next':'Consultar estado de documentación','notes':[]}]
leads=[{'id':'LEAD-01','name':'Carolina Méndez','category':'Caución','source':'Facebook','stage':'Nueva consulta','marketing':False},{'id':'LEAD-02','name':'Matías Acosta','category':'Autos','source':'Link de Daniel','stage':'Cotización enviada','marketing':True},{'id':'LEAD-03','name':'Andrea Ortiz','category':'Hogar','source':'Referido','stage':'Seguimiento','marketing':False},{'id':'LEAD-04','name':'Fernando Suárez','category':'Accidentes personales','source':'Instagram','stage':'Nueva consulta','marketing':True}]
tasks=[{'id':'ADM-1','title':'Conciliar liquidaciones de comisiones','area':'Comisiones','due':date(1),'done':False},{'id':'ADM-2','title':'Revisar comprobantes y retenciones de IIBB','area':'Contabilidad','due':date(3),'done':False},{'id':'ADM-3','title':'Preparar carpeta para Convenio Multilateral','area':'Contabilidad','due':date(5),'done':False},{'id':'ADM-4','title':'Control de registros y rúbrica digital','area':'Registros','due':date(7),'done':False}]
docs=[{'id':'DOC-01','name':'Guía de operación Daniel · muestra.txt','kind':'Texto de muestra','text':'El día comienza revisando alertas. Priorizar vencimientos e impagos. Los siniestros con más de 14 días sin movimiento requieren seguimiento. Cada operación corresponde al código propio del productor.'},{'id':'DOC-02','name':'Cartera de Daniel · muestra','kind':'230 registros','text':'Cartera ficticia vinculada al perfil de Daniel Stern.'},{'id':'DOC-03','name':'Criterios de revisión · muestra.txt','kind':'Texto de muestra','text':'Antes de aprobar un borrador verificar identidad, riesgo, condiciones, documentación, aceptación e instrumento de pago. No emitir cobertura en esta demo.'}]
d={'version':1,'demoDate':str(base),'producer':{'id':'PAS-DANI','name':'Daniel Stern','organization':'Turi','photo':'assets/daniel.webp','activePolicies':230},'companies':companies,'clients':clients,'policies':policies,'alerts':alerts,'claims':claims,'leads':leads,'drafts':[],'tasks':tasks,'documents':docs,'chat':[],'preferences':{'provider':None,'courses':[]},'activity':[]}
(R/'dist/data.js').write_text('window.TURI_SEED = '+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';\n')
# Relational fixture for the next Worker/D1 stage; never put authentication secrets in this seed.
schema='''PRAGMA foreign_keys=ON;
CREATE TABLE producers(id TEXT PRIMARY KEY,name TEXT NOT NULL,organization TEXT NOT NULL);
CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,portal_url TEXT NOT NULL);
CREATE TABLE producer_companies(producer_id TEXT REFERENCES producers(id),company_id TEXT REFERENCES companies(id),demo_pas_code TEXT NOT NULL,PRIMARY KEY(producer_id,company_id));
CREATE TABLE clients(id TEXT PRIMARY KEY,producer_id TEXT NOT NULL REFERENCES producers(id),name TEXT NOT NULL,email TEXT,marketing_consent INTEGER NOT NULL DEFAULT 0);
CREATE TABLE policies(id TEXT PRIMARY KEY,producer_id TEXT NOT NULL REFERENCES producers(id),client_id TEXT NOT NULL REFERENCES clients(id),company_id TEXT NOT NULL REFERENCES companies(id),category TEXT NOT NULL,risk TEXT NOT NULL,expiry TEXT NOT NULL,status TEXT NOT NULL,premium_demo INTEGER NOT NULL);
CREATE TABLE alerts(id TEXT PRIMARY KEY,producer_id TEXT NOT NULL REFERENCES producers(id),policy_id TEXT REFERENCES policies(id),category TEXT NOT NULL,priority TEXT CHECK(priority IN ('red','yellow','green')),due_at TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE claims(id TEXT PRIMARY KEY,producer_id TEXT NOT NULL REFERENCES producers(id),policy_id TEXT NOT NULL REFERENCES policies(id),stage TEXT NOT NULL,last_update TEXT NOT NULL,next_action TEXT NOT NULL);
CREATE TABLE drafts(id TEXT PRIMARY KEY,producer_id TEXT NOT NULL REFERENCES producers(id),client_id TEXT REFERENCES clients(id),version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL CHECK(status IN ('pending','approved_demo','correction')),coverage_issued INTEGER NOT NULL DEFAULT 0 CHECK(coverage_issued=0));
CREATE INDEX policies_by_producer_expiry ON policies(producer_id,expiry);
CREATE INDEX alerts_by_producer_due ON alerts(producer_id,done,due_at);
'''
(R/'docs/schema.sql').write_text(schema)
con=sqlite3.connect(':memory:');con.executescript(schema)
con.execute('INSERT INTO producers VALUES(?,?,?)',('PAS-DANI','Daniel Stern','Turi'))
con.executemany('INSERT INTO companies VALUES(?,?,?)',[(c['id'],c['name'],c['portal']) for c in companies])
con.executemany('INSERT INTO producer_companies VALUES(?,?,?)',[('PAS-DANI',c['id'],c['code']) for c in companies])
con.executemany('INSERT INTO clients VALUES(?,?,?,?,?)',[(c['id'],'PAS-DANI',c['name'],c['email'],int(c['marketing'])) for c in clients])
con.executemany('INSERT INTO policies VALUES(?,?,?,?,?,?,?,?,?)',[(p['id'],'PAS-DANI',p['clientId'],p['company'],p['category'],p['risk'],p['expiry'],p['status'],p['premium']) for p in policies])
con.executemany('INSERT INTO alerts VALUES(?,?,?,?,?,?,?)',[(a['id'],'PAS-DANI',a['policyId'],a['category'],a['priority'],a['due'],0) for a in alerts])
con.executemany('INSERT INTO claims VALUES(?,?,?,?,?,?)',[(a['id'],'PAS-DANI',a['policyId'],a['stage'],a['lastUpdate'],a['next']) for a in claims])
(R/'docs/seed.sql').write_text('\n'.join(con.iterdump())+'\n')
assert con.execute('PRAGMA foreign_key_check').fetchall()==[]
assert con.execute("SELECT count(*) FROM policies WHERE status='Activa'").fetchone()[0]==230
print('Seed: 230 pólizas, 230 clientes, 15 compañías, 7 alertas, 5 siniestros. Integridad referencial OK.')
# Embedded supplied photos are resolved only as a fallback when loading a single-file preview.
(R/'dist/assets/embedded.js').write_text('window.TURI_ASSETS = {};\n')
