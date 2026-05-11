import { h } from 'vue'
import { SvgIconOnline } from '@/components/common'

export const useIconRender = () => {
  type IconConfig = {
    icon?: string
    color?: string
    fontSize?: number
  }

  type IconStyle = {
    color?: string
    fontSize?: string
  }

  const iconRender = (config: IconConfig) => {
    const { color, fontSize, icon } = config

    const style: IconStyle = {}

    if (color)
      style.color = color

    if (fontSize)
      style.fontSize = `${fontSize}px`

    if (!icon)
      window.console.warn('iconRender: icon is required')

    return () => h(SvgIconOnline, { icon, style })
  }

  return {
    iconRender,
  }
}
