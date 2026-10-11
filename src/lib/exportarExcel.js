// Exporta hojas a un archivo Excel. La librería se carga solo al exportar.
export async function exportarExcel(nombreArchivo, hojas) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  for (const { nombre, filas } of hojas) {
    const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin datos' }]);
    const columnas = Object.keys(filas[0] || {});
    hoja['!cols'] = columnas.map((c) => ({
      wch: Math.min(40, Math.max(c.length, ...filas.slice(0, 200).map((f) => String(f[c] ?? '').length)) + 2),
    }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  XLSX.writeFile(libro, nombreArchivo);
}

// Lee la primera hoja de un Excel como lista de objetos (encabezados = nombres de columna).
export async function leerExcel(archivo) {
  const XLSX = await import('xlsx');
  const libro = XLSX.read(await archivo.arrayBuffer());
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
}
