import openpyxl
from datetime import datetime, date

wb = openpyxl.load_workbook('c:/app_Proyec_social/1. Propuesta Matrices de Seguimiento Base - 2026A.xlsx', data_only=True)
BASE_DATE = date(2026, 2, 11)

def to_date(val):
    if isinstance(val, datetime): return val.date()
    if isinstance(val, date): return val
    return None

def days_from_base(val):
    d = to_date(val)
    return (d - BASE_DATE).days if d else None

def get_month_str(val):
    d = to_date(val)
    return {2:'febrero',3:'marzo',4:'abril',5:'mayo'}.get(d.month,'febrero') if d else 'febrero'

def get_week(val):
    d = to_date(val)
    return max(1, (d - BASE_DATE).days // 7 + 1) if d else None

def clean(s):
    if s is None: return ''
    r = str(s).replace("'","''").strip()
    r = r.replace('\n',' ').replace('\r','').replace('\x00','')
    return r[:500]

def parse_sheet(sheet_name):
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))
    header_row = None
    for i,r in enumerate(rows):
        if r[6] and 'Entregable' in str(r[6]) and r[8] and 'hora' in str(r[8]).lower():
            header_row = i
            break
    if header_row is None:
        return []
    deliverables = []
    current_fase = ''
    current_semana = 1
    for row in rows[header_row+1:]:
        if not any(v is not None for v in row):
            continue
        col0 = row[0]
        col1 = row[1]
        col6 = row[6]
        col7 = row[7]
        col8 = row[8]
        col9 = row[9]
        col10 = row[10]
        if col0 and isinstance(col0,str) and any(m in col0.lower() for m in ['febrero','marzo','abril','mayo']):
            current_fase = col0.strip().replace('\n',' ')
            if col1 and isinstance(col1,str) and 'semana' in col1.lower():
                w = get_week(to_date(col9)) if col9 else None
                if w:
                    current_semana = w
            continue
        if col1 and isinstance(col1,str) and 'semana' in col1.lower():
            w = get_week(to_date(col9)) if col9 else None
            if w:
                current_semana = w
            continue
        if not col6 or not isinstance(col6,str):
            continue
        try:
            num = int(float(col1)) if col1 is not None else len(deliverables)+1
        except:
            num = len(deliverables)+1
        fecha_ini = to_date(col9)
        fecha_fin = to_date(col10)
        semana = get_week(fecha_fin or fecha_ini) or current_semana
        mes = get_month_str(fecha_fin or fecha_ini)
        try:
            horas = round(float(str(col8).replace(',','.')),1) if col8 else 0
        except:
            horas = 0
        deliverables.append({
            'numero': num,
            'categoria': clean(current_fase)[:120],
            'fase': clean(current_fase)[:120],
            'mes': mes,
            'semana_numero': semana,
            'entregable': clean(col6),
            'descripcion_evidencia': clean(col7),
            'horas': horas,
            'dias_inicio_desde_feb': days_from_base(fecha_ini),
            'dias_fin_desde_feb': days_from_base(fecha_fin),
        })
    return deliverables

grupos = [
    (1,'Grupo 1 - Antiguo 24h - 1Pro 4Act 2Conv.Din','Antiguo 24h: 1 Proyecto, 4 Actividades, 2 Convenios Dinamizados','ANTIGUO',24,1,4,0,2,'G1 24 h 1Pro-4Act-2Conv.Dinam A'),
    (2,'Grupo 2 - Antiguo 24h - 1Pro 4Act 1Conv.Nvo','Antiguo 24h: 1 Proyecto, 4 Actividades, 1 Convenio Nuevo','ANTIGUO',24,1,4,1,0,'G2 24h 1 Pro - 4 Act - 1 Conv. '),
    (3,'Grupo 3 - Antiguo 24h - 2Pro 2Act 2Conv.Din','Antiguo 24h: 2 Proyectos, 2 Actividades, 2 Convenios Dinamizados','ANTIGUO',24,2,2,0,2,'G3 24h 2 Pro - 2 Act - 2 Conv. '),
    (4,'Grupo 4 - Antiguo 24h - 3Pro 1Act 1Conv.Nvo','Antiguo 24h: 3 Proyectos, 1 Actividad, 1 Convenio Nuevo','ANTIGUO',24,3,1,1,0,'G4OSCARROD 24h 3 Pro - 1 Act - '),
    (5,'Grupo 5 - Antiguo 25h - 3Pro 1Act 1Conv.Nvo','Antiguo 25h: 3 Proyectos, 1 Actividad, 1 Convenio Nuevo','ANTIGUO',25,3,1,1,0,'G5 25h 3 Pro - 1 Act - 1 Conv. '),
    (6,'Grupo 6 - Antiguo 25h - 4Pro 1Conv.Nvo','Antiguo 25h: 4 Proyectos, 1 Convenio Nuevo','ANTIGUO',25,4,0,1,0,'G6EFRAIN 25h 4 Pro - 1 Conv. Nu'),
    (8,'Grupo 8 - Antiguo 20h - 1Pro 3Act 1Conv.Din','Antiguo 20h: 1 Proyecto, 3 Actividades, 1 Convenio Dinamizado','ANTIGUO',20,1,3,0,1,'G8 20h 1 Pro - 3 Act - 1 Conv. '),
    (9,'Grupo 9 - Antiguo 21h - 1Pro 3Act 1Conv.Din','Antiguo 21h: 1 Proyecto, 3 Actividades, 1 Convenio Dinamizado','ANTIGUO',21,1,3,0,1,'G9 21h 1 Pro - 3 Act - 1 Conv. '),
    (10,'Grupo 10 - Antiguo 22h - 1Pro 3Act 2Conv.Din','Antiguo 22h: 1 Proyecto, 3 Actividades, 2 Convenios Dinamizados','ANTIGUO',22,1,3,0,2,'G10 22h 1 Pro - 3 Act - 1 Conv.'),
    (11,'Grupo 11 - Antiguo 23h - 1Pro 4Act 1Conv.Din','Antiguo 23h: 1 Proyecto, 4 Actividades, 1 Convenio Dinamizado','ANTIGUO',23,1,4,0,1,'G11 23h 1 Pro - 4 Act - 1 Conv.'),
    (12,'Grupo 12 - Nuevo 20h - 1Pro 2Act 1Conv.Nvo','Nuevo 20h: 1 Proyecto, 2 Actividades, 1 Convenio Nuevo','NUEVO',20,1,2,1,0,'G12  20h 1 Pro - 2 Act -  Conv.'),
    (13,'Grupo 13 - Nuevo 24h - 1Pro 3Act 1Conv.Nvo','Nuevo 24h: 1 Proyecto, 3 Actividades, 1 Convenio Nuevo','NUEVO',24,1,3,1,0,'G13 24h 1 Pro - 3 Act - 1 Conv.'),
    (14,'Grupo 14 - Nuevo 12h - 1Pro 1Act 1Conv.Nvo','Nuevo 12h: 1 Proyecto, 1 Actividad, 1 Convenio Nuevo','NUEVO',12,1,1,1,0,'G14 12h 1 Pro - 1 Act - 1 Conv.'),
    (15,'Grupo 15 - Antiguo 24h - 2Pro 1Conv.Nvo','Antiguo 24h: 2 Proyectos, 1 Convenio Nuevo','ANTIGUO',24,2,0,1,0,'G15 24h 2 Pro - 1 Conv.Nuev Nue'),
]

lines = []
lines.append("-- ============================================================")
lines.append("-- SEED: grupos_matriz + plantilla_entregables")
lines.append("-- Extraido del Excel: Propuesta Matrices de Seguimiento 2026A")
lines.append("-- Base date inicio semestre: 2026-02-11")
lines.append("-- ============================================================")
lines.append("")
lines.append("TRUNCATE TABLE plantilla_entregables RESTART IDENTITY CASCADE;")
lines.append("TRUNCATE TABLE grupos_matriz RESTART IDENTITY CASCADE;")
lines.append("")
lines.append("-- 1. GRUPOS")
lines.append("INSERT INTO grupos_matriz (id, nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo) VALUES")
grupo_rows = []
for g in grupos:
    gid,nombre,desc,tipo,horas,nproj,nact,nconv_nvo,nconv_din,_ = g
    grupo_rows.append("({}, '{}', '{}', '{}', {}, {}, {}, {}, {}, TRUE)".format(
        gid, clean(nombre), clean(desc), tipo, horas, nproj, nact, nconv_nvo, nconv_din))
lines.append(',\n'.join(grupo_rows) + ';')
lines.append("")
lines.append("SELECT setval('grupos_matriz_id_seq', (SELECT MAX(id) FROM grupos_matriz));")
lines.append("")

total = 0
for g in grupos:
    gid,nombre,desc,tipo,horas,nproj,nact,nconv_nvo,nconv_din,sheet = g
    items = parse_sheet(sheet)
    total += len(items)
    lines.append("-- Grupo {}: {} ({} entregables)".format(gid, nombre, len(items)))
    if items:
        lines.append("INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES")
        ent_rows = []
        for d in items:
            di = str(d['dias_inicio_desde_feb']) if d['dias_inicio_desde_feb'] is not None else 'NULL'
            df = str(d['dias_fin_desde_feb']) if d['dias_fin_desde_feb'] is not None else 'NULL'
            ent_rows.append("({}, {}, '{}', '{}', '{}', {}, '{}', '{}', {}, {}, {})".format(
                gid, d['numero'], d['categoria'], d['fase'], d['mes'], d['semana_numero'],
                d['entregable'], d['descripcion_evidencia'], d['horas'], di, df))
        lines.append(',\n'.join(ent_rows) + ';')
    lines.append("")

lines.append("-- Total grupos: {}".format(len(grupos)))
lines.append("-- Total entregables: {}".format(total))

sql = '\n'.join(lines)
with open('c:/app_Proyec_social/backend/migrations/fase4_seed_grupos_plantillas.sql', 'w', encoding='utf-8') as f:
    f.write(sql)

print("OK - {} chars, {} grupos, {} entregables".format(len(sql), len(grupos), total))
for g in grupos:
    gid = g[0]
    nombre = g[1]
    sheet = g[9]
    items = parse_sheet(sheet)
    print("  G{}: {} entregables".format(gid, len(items)))
