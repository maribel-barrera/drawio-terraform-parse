#!/usr/bin/env node

import { XMLParser } from "./src/XMLParser.js";
import { AWSComponentExtractor } from "./src/AWSComponentExtractor.js";

async function debugCIDRExtraction() {
  const xmlParser = new XMLParser();
  const awsExtractor = new AWSComponentExtractor();
  
  console.log('🔍 DEBUG: Extracción de CIDR de subnets');
  console.log('==========================================');
  
  try {
    // Parsear el archivo
    const mxGraphModel = await xmlParser.parseDrawIOFile("Arquitectura AWS-Account.drawio.xml");
    const graphElements = xmlParser.extractGraphElements({ mxGraphModel });
    
    // Convertir elementos
    const elements = extractElementsFromGraph(graphElements);
    
    // Identificar componentes AWS
    const awsComponents = awsExtractor.identifyAWSComponents(elements);
    
    console.log(`\n📊 Total subnets encontradas: ${awsComponents.subnets.length}`);
    
    // Examinar cada subnet en detalle
    awsComponents.subnets.forEach((subnet, index) => {
      console.log(`\n--- SUBNET ${index + 1} ---`);
      console.log(`ID: ${subnet.id}`);
      console.log(`Label: "${subnet.label || 'N/A'}"`);
      console.log(`Value: "${subnet.value || 'N/A'}"`);
      console.log(`Style: ${subnet.style ? subnet.style.substring(0, 100) + '...' : 'N/A'}`);
      
      // Probar extracción de CIDR
      const cidr = extractCIDRFromElement(subnet);
      console.log(`CIDR extraído: ${cidr || 'NO ENCONTRADO'}`);
      
      // Probar extracción de nombre
      const name = extractNameFromElement(subnet);
      console.log(`Nombre extraído: ${name || 'NO ENCONTRADO'}`);
      
      // Buscar CIDR en el texto manualmente
      const text = subnet.label || subnet.value || '';
      const cidrMatches = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/g);
      console.log(`CIDRs en texto: ${cidrMatches ? cidrMatches.join(', ') : 'NINGUNO'}`);
      
      // Buscar patrones específicos del problema
      if (text.includes('10.102.67.96')) {
        console.log(`⚠️  PROBLEMA DETECTADO: Contiene "10.102.67.96" pero CIDR extraído es: ${cidr}`);
        console.log(`   Texto completo: "${text}"`);
      }
    });
    
    // Examinar el procesamiento posterior
    console.log('\n🔧 PROCESAMIENTO POSTERIOR');
    console.log('==========================');
    
    const subnetInfo = awsExtractor.extractSubnetInfo(awsComponents.subnets);
    
    subnetInfo.forEach((subnet, index) => {
      if (subnet.name && subnet.name.includes('rt7')) {
        console.log(`\n--- SUBNET PROCESADA (rt7) ---`);
        console.log(`ID: ${subnet.id}`);
        console.log(`Nombre: ${subnet.name}`);
        console.log(`CIDR: ${subnet.cidr}`);
        console.log(`Elemento original:`, subnet.originalElement.label || subnet.originalElement.value);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

function extractElementsFromGraph(graphModel) {
  const elements = [];
  
  if (!graphModel || !graphModel.root) {
    return elements;
  }

  const root = graphModel.root;
  
  // Procesar UserObjects
  if (root.UserObject) {
    const userObjects = Array.isArray(root.UserObject) ? root.UserObject : [root.UserObject];
    userObjects.forEach(uo => {
      if (uo.mxCell) {
        const element = {
          id: uo.mxCell.id || uo.id,
          vertex: uo.mxCell.vertex === "1",
          edge: uo.mxCell.edge === "1",
          style: uo.mxCell.style || '',
          parent: uo.mxCell.parent,
          source: uo.mxCell.source,
          target: uo.mxCell.target,
          value: uo.label || uo.mxCell.value || '',
          label: uo.label || uo.mxCell.value || '',
          props: { ...uo }
        };
        delete element.props.mxCell;
        elements.push(element);
      }
    });
  }

  // Procesar mxCells directas
  if (root.mxCell) {
    const mxCells = Array.isArray(root.mxCell) ? root.mxCell : [root.mxCell];
    mxCells.forEach(cell => {
      if (cell.id) {
        const element = {
          id: cell.id,
          vertex: cell.vertex === "1",
          edge: cell.edge === "1",
          style: cell.style || '',
          parent: cell.parent,
          source: cell.source,
          target: cell.target,
          value: cell.value || '',
          label: cell.value || '',
          props: {}
        };
        elements.push(element);
      }
    });
  }

  return elements;
}

function extractCIDRFromElement(element) {
  // Simular el método _extractCIDR del AWSComponentExtractor
  
  // Buscar en propiedades primero
  if (element.props && element.props.cidr) {
    return element.props.cidr;
  }

  // Buscar en label/value con patrón actualizado
  const text = (element.label || element.value || '');
  const cidrPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\s*\/\s*\d{1,2}\b/;
  const match = text.match(cidrPattern);
  if (match) {
    // Limpiar espacios del CIDR extraído
    return match[0].replace(/\s+/g, '');
  }
  
  return null;
}

function extractNameFromElement(element) {
  // Simular el método _extractName del AWSComponentExtractor
  
  // Prioridad: props.name > label > value > id
  if (element.props && element.props.name) {
    return element.props.name;
  }
  
  if (element.label) {
    return cleanLabel(element.label);
  }
  
  if (element.value) {
    return cleanLabel(element.value);
  }
  
  return element.id || null;
}

function cleanLabel(label) {
  if (!label) return '';
  
  // Remover tags HTML
  let cleaned = label.replace(/<[^>]+>/g, '');
  
  // Reemplazar entidades HTML comunes
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&#xa;/g, '\n'); // Agregar esta línea
  
  // Normalizar espacios
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// Ejecutar debug
debugCIDRExtraction();