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
    role: { type: String, default: '普通用户' },
    online: { type: Boolean, default: false },
  },
  setup(props: Props) {
    return () => (
      <div class="user-badge">
        <span class="badge-name" title="用户名称">{props.name}</span>
        <span class="badge-role">{props.role}</span>
        <span class={"badge-status " + (props.online ? 'online' : 'offline')}>
          {props.online ? '在线' : '离线'}
        </span>
      </div>
    );
  },
});

// 日志
console.log('UserBadge component registered')
