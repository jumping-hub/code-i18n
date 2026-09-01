import { useI18n } from 'vue-i18n'
/**
 * JSX 组件：演示 JSX 文本与属性提取
 */
import { defineComponent } from 'vue'

interface Props {
  name: string;
  role: string;
  online: boolean;
}

export const UserBadge = defineComponent({
  props: {
    name: { type: String, required: true },
    role: { type: String, default: t('src.components.UserBadge.普通用户.ae8ab1') },
    online: { type: Boolean, default: false },
  },
  setup(props: Props) {
    return () => (
      <div class="user-badge">
        <span class="badge-name" title={t('src.components.UserBadge.用户名称.1cd431')}>{props.name}</span>
        <span class="badge-role">{props.role}</span>
        <span class={"badge-status " + (props.online ? 'online' : 'offline')}>
          {props.online ? t('src.components.UserBadge.在线.01be7f') : t('src.components.UserBadge.离线.c1e38c')}
        </span>
      </div>
    );
  },
});

// 日志
console.log('UserBadge component registered')
