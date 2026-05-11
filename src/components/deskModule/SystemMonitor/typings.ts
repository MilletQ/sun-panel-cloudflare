export enum MonitorType {
  'cpu' = 'cpu', // 图标风格
  'memory' = 'memory', // 详情风格
  'disk' = 'disk',
}

export type CardStyle = {
  background: string
}

export type MonitorData = {
  monitorType: MonitorType
  extendParam?: { [key: string]: [value:any] } | any
  description?: string
  // cardStyle: CardStyle
}

export type ProgressStyle = {
  color: string
  railColor: string
  height: number
}

export type GenericProgressStyleExtendParam = {
  progressColor: string
  progressRailColor: string
  color: string
  backgroundColor: string
}

export type DiskExtendParam = {
  path: string
} & GenericProgressStyleExtendParam
