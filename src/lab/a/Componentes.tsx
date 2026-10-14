import { useRef, useState } from "react";
import { Marca, Pista, Tip, toast } from "./ui";

const TOKENS: { n: string; v: string; claro?: boolean }[] = [
  { n: "papel", v: "#F5F6F2", claro: true }, { n: "campo", v: "#EBEDE6", claro: true }, { n: "tinta", v: "#0E1A14" },
  { n: "tinta-2", v: "#38453D" }, { n: "tinta-3", v: "#5B6860" }, { n: "pino", v: "#0C5A43" },
  { n: "sello", v: "#B8341F" }, { n: "ocre", v: "#8F6000" }, { n: "petróleo", v: "#1C5876" },
];

export function Componentes() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [cargando, setCargando] = useState(false);
  const [correo, setCorreo] = useState("coordinacion@");
  const error = !correo.includes("@") || correo.endsWith("@");

  return (
    <div className="wrap comp">
      <h1>Componentes</h1>

      <section aria-labelledby="c-tipo">
        <h2 id="c-tipo">Tipografía</h2>
        <div className="esc">
          <div><small>Newsreader 66 / 500</small><span style={{ font: "500 56px/1 var(--serif)", letterSpacing: "-0.03em" }}>Semana 8</span></div>
          <div><small>Newsreader 34 / 500</small><span style={{ font: "500 34px/1.1 var(--serif)", letterSpacing: "-0.02em" }}>Por revisar</span></div>
          <div><small>Newsreader 20 · lectura</small><span style={{ font: "400 20px/1.5 var(--serif)", maxWidth: "58ch" }}>Una frase con cifras que se leen como parte del texto: <b>20,5 %</b> reportado frente a <b>40,9 %</b> esperado.</span></div>
          <div><small>Instrument Sans 16 / 500</small><span style={{ font: "500 16px/1.4 var(--sans)" }}>Entregable con título de dos líneas y jerarquía clara</span></div>
          <div><small>Instrument Sans 13 · apoyo</small><span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--tinta-3)" }}>Capacitación y asistencia técnica · DEV Convenio Alcaldía local</span></div>
        </div>
      </section>

      <section aria-labelledby="c-color">
        <h2 id="c-color">Color</h2>
        <div className="paleta">
          {TOKENS.map((t) => (
            <div key={t.n} style={{ background: t.v, color: t.claro ? "var(--tinta)" : "#fff" }}>
              {t.n}<small>{t.v}</small>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="c-btn">
        <h2 id="c-btn">Botones</h2>
        <div className="fila-c">
          <button type="button" className="btn" onClick={() => toast("Guardado")}>Guardar cambios</button>
          <button type="button" className="btn sec">Cancelar</button>
          <button type="button" className="btn txt">Ver detalle</button>
          <button type="button" className="btn mal" onClick={() => dlg.current?.showModal()}>Retirar envío…</button>
          <button type="button" className="btn" disabled>Deshabilitado</button>
          <button type="button" className="btn" aria-busy={cargando} onClick={() => { setCargando(true); window.setTimeout(() => { setCargando(false); toast("Enviado a revisión"); }, 1400); }}>
            {cargando && <span className="spin" aria-hidden />}
            {cargando ? "Enviando" : "Enviar a revisión"}
          </button>
        </div>
      </section>

      <section aria-labelledby="c-campos">
        <h2 id="c-campos">Campos</h2>
        <div className="fila-c" style={{ alignItems: "start" }}>
          <div className="campo">
            <label htmlFor="c1">Enlace de la evidencia</label>
            <input id="c1" placeholder="https://drive.google.com/…" />
            <small>Comparte el enlace con las cuentas de coordinación.</small>
          </div>
          <div className="campo" data-error={error}>
            <label htmlFor="c2">Correo institucional</label>
            <input id="c2" value={correo} onChange={(e) => setCorreo(e.target.value)} aria-invalid={error} aria-describedby="c2h" />
            <small id="c2h">{error ? "Escribe un correo completo, por ejemplo coordinacion@cun.edu.co" : "Correo válido"}</small>
          </div>
          <div className="campo">
            <label htmlFor="c3">Semestre</label>
            <select id="c3" defaultValue="2026B"><option>2026A</option><option>2026B</option></select>
          </div>
          <div className="campo">
            <label htmlFor="c4">Deshabilitado</label>
            <input id="c4" disabled value="No editable" readOnly />
          </div>
        </div>
      </section>

      <section aria-labelledby="c-est">
        <h2 id="c-est">Estados</h2>
        <div className="fila-c">
          <Marca e="aprobado" /><Marca e="enviado" /><Marca e="observado" /><Marca e="vencido" /><Marca e="no_iniciado" /><Marca e="borrador" />
        </div>
        <div style={{ gridColumn: 2, display: "grid", gap: 14, maxWidth: 420 }}>
          <Pista valor={20.5} esperado={40.9} etiqueta="Reportado 20,5 %, esperado 40,9 %" />
          <small style={{ font: "400 13px/1.4 var(--sans)", color: "var(--tinta-3)" }}>Pista de avance: relleno = reportado, marca vertical = esperado a la fecha.</small>
        </div>
      </section>

      <section aria-labelledby="c-int">
        <h2 id="c-int">Interacción</h2>
        <div className="fila-c">
          <Tip texto="Retraso la primera vez; el siguiente aparece al instante"><button type="button" className="btn sec">Pasa el cursor</button></Tip>
          <Tip texto="Sin retraso ni animación porque ya hay uno abierto"><button type="button" className="btn sec">Y luego este</button></Tip>
          <button type="button" className="btn sec" onClick={() => toast("Entregable aprobado", () => toast("Acción deshecha"))}>Mostrar aviso con «Deshacer»</button>
          <button type="button" className="btn sec" onClick={() => dlg.current?.showModal()}>Abrir diálogo</button>
        </div>
      </section>

      <dialog ref={dlg} className="dlg" aria-labelledby="dlg-t" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <h2 id="dlg-t">¿Retirar el envío?</h2>
        <p>El entregable vuelve a estar por hacer y podrás corregir la evidencia antes de enviarlo de nuevo. Se conserva el historial.</p>
        <footer>
          <button type="button" className="btn sec" onClick={() => dlg.current?.close()}>Cancelar</button>
          <button type="button" className="btn mal" onClick={() => { dlg.current?.close(); toast("Envío retirado"); }}>Retirar envío</button>
        </footer>
      </dialog>
    </div>
  );
}
