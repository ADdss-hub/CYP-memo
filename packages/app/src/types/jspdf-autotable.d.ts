/**
 * jspdf-autotable 类型声明
 */
declare module 'jspdf-autotable' {
  import { jsPDF } from 'jspdf'

  interface AutoTableOptions {
    head?: any[][]
    body?: any[][]
    startY?: number
    styles?: {
      font?: string
      fontSize?: number
      [key: string]: any
    }
    headStyles?: {
      fillColor?: number[]
      textColor?: number[]
      [key: string]: any
    }
    columnStyles?: {
      [key: number]: {
        cellWidth?: number
        [key: string]: any
      }
    }
    [key: string]: any
  }

  function autoTable(doc: jsPDF, options: AutoTableOptions): void

  export default autoTable
}
