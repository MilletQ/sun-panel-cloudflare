<script setup lang='ts'>
import { NImage } from 'naive-ui'
import { computed, ref } from 'vue'
const props = defineProps<{
  src: string
}>()

const emit = defineEmits<{
  (event: 'click'): void
  (event: 'refresh'): void
}>()

const randCode = ref<string>('0')
const imageSrc = computed(() => {
  const separator = props.src.includes('?') ? '&' : '?'
  return `${props.src}${separator}${randCode.value}`
})

function handleClick() {
  randCode.value = String(rand(100, 99999))
  emit('click')
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min)) + min
}

defineExpose({
  // 刷新验证码
  refresh() {
    handleClick()
  },
})
</script>

<template>
  <!-- <div> -->
  <NImage
    :src="imageSrc"
    :preview-disabled="true"
    @click="handleClick"
  />
  <!-- </div> -->
</template>
