if (!document.getElementById('loyaltyPointPolicyStyles')) {
  const style = document.createElement('style');
  style.id = 'loyaltyPointPolicyStyles';
  style.textContent = `
    #loyaltyPointPolicyEditor .loyalty-policy-label { display:block; margin-bottom:.45rem; color:#5A4C3A; font-size:.76rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    #loyaltyPointPolicyEditor .loyalty-policy-input { width:100%; padding:.72rem .8rem; border:1px solid #D1C5B5; border-radius:.7rem; background:#FFFDF8; color:#3A2E27; font-size:.92rem; outline:none; }
    #loyaltyPointPolicyEditor .loyalty-policy-input:focus { border-color:#C89B3C; box-shadow:0 0 0 3px rgba(200,155,60,.14); }
  `;
  document.head.appendChild(style);
}
