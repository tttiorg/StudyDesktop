<template>
  <div class="nf">
    <div class="code">404</div>
    <p class="txt">这个页面还不存在</p>
    <el-button type="primary" @click="$router.push('/')">回到课表</el-button>
  </div>
</template>

<style scoped>
.nf {
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 80px 0;
  text-align: center;
}

.code {
  font-size: 46px;
  font-weight: 700;
  color: var(--sde-border);
  letter-spacing: 2px;
}

.txt {
  margin: 0;
  color: var(--sde-muted);
  font-size: 13.5px;
}
</style>
