const h = (type, props, ...kids) => ({
  type,
  props: { ...props, children: kids.length === 1 ? kids[0] : kids.flat() },
});

export default h;
